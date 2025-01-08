document.addEventListener('alpine:init', () => {
    Alpine.data('appData', () => ({
        // State
        shouldStop: false,
        inputMethod: 'file',
        fileInput: null,
        files: [],
        textInput: '',
        includeInput: '',
        includeInputCase: false,
        excludeInput: '',
        excludeInputCase: false,
        hideInput: '',
        hideInputCase: false,
        resultLineCount: 0,
        isWrap: false,
        outputLimit: 1000,
        isProcessing: false,
        contextLines: 0,  // 上下文行数，0表示普通搜索
        activeTab: 'main',  // 当前激活的标签页
        tabs: [{id: 'main', title: 'Search Result'}],  // 标签页列表
        isContextSearch: false,  // 标识是否是上下文搜索

        // Methods
        stopProcessing() {
            this.shouldStop = true;
            this.isProcessing = false;
        },

        reset() {
            this.inputMethod = 'file';
            this.textInput = '';
            this.fileInput = null;
            this.clearResult();
            document.getElementById('fileInput').value = '';
            this.shouldStop = false;
        },

        toggleWrap() {
            this.isWrap = !this.isWrap;
        },

        clearResult() {
            // 只清除当前活动标签的内容
            const resultDiv = document.getElementById(`result-${this.activeTab}`);
            if (resultDiv) {
                resultDiv.innerHTML = '';
                this.resultLineCount = 0;
            }
        },

        renderResult() {
            this.clearResult();
            this.isProcessing = true;
            this.shouldStop = false;
            this.inputMethod === 'file' ? this.renderFromFileInput() : this.renderFromTextInput();
        },

        renderFromTextInput() {
            const { includeRegexes, excludeRegexes, hideRegexes } = this.buildRegexes();
            const lines = this.textInput.split("\n");

            for (let line of lines) {
                if (this.resultLineCount >= this.outputLimit) break;
                this.processLine(line, includeRegexes, excludeRegexes, hideRegexes);
            }
            this.isProcessing = false;
        },

        buildRegexes() {
            const includeKeywords = this.includeInput.trim().split(" ").filter(Boolean);
            const excludeKeywords = this.excludeInput.trim().split(" ").filter(Boolean);
            const hideTexts = this.hideInput.trim().split(" ").filter(Boolean);

            return {
                includeRegexes: includeKeywords.map(key => new RegExp(key, this.includeInputCase ? 'i' : '')),
                excludeRegexes: excludeKeywords.map(key => new RegExp(key, this.excludeInputCase ? 'i' : '')),
                hideRegexes: hideTexts.map(key => new RegExp(key, this.hideInputCase ? 'i' : ''))
            };
        },

        processLine(line, includeRegexes, excludeRegexes, hideRegexes, fileName) {
            // 只处理普通搜索模式
            const include = includeRegexes.every(regex => regex.test(line));
            const exclude = excludeRegexes.every(regex => !regex.test(line));

            if (include && exclude) {
                hideRegexes.forEach(regex => {
                    line = line.replace(regex, "");
                });
                this.writeLine(line, { fileName });
            }
        },

        onFileChanged(event) {
            const files = Array.from(event.target.files);
            if (files.length > 0) {
                this.files = files.sort((a, b) => a.name.localeCompare(b.name));
                this.fileInput = event.target;
                this.inputMethod = 'file';
            }
        },

        renderFromFileInput() {
            if (!this.files.length) return;
            
            const processNextFile = (index) => {
                if (index >= this.files.length || this.resultLineCount >= this.outputLimit) {
                    this.isProcessing = false;
                    return;
                }

                const file = this.files[index];
                const fileName = file.name.toLowerCase();
                
                const onComplete = () => {
                    processNextFile(index + 1);
                };

                if (fileName.endsWith('.gz')) {
                    this.processGzFile(file, onComplete);
                } else if (fileName.endsWith('.zip')) {
                    this.processZipFile(file, onComplete);
                } else {
                    this.processTextFile(file, onComplete);
                }
            };

            processNextFile(0);
        },

        processGzFile(file, onComplete) {
            const chunkSize = 1024 * 1024;
            let offset = 0;
            const reader = new FileReader();
            const gunzip = new pako.Inflate({to: 'string'});

            gunzip.onData = chunk => {
                this.processChunk(chunk, file.name);
                if (this.resultLineCount >= this.outputLimit) {
                    reader.abort();
                    this.isProcessing = false;
                    onComplete();
                }
            };

            reader.onload = e => {
                gunzip.push(new Uint8Array(e.target.result), false);
                offset += chunkSize;
                if (offset < file.size && this.resultLineCount < this.outputLimit) {
                    readNextChunk();
                } else {
                    gunzip.push(new Uint8Array(), true);
                    onComplete();
                }
            };

            const readNextChunk = () => {
                reader.readAsArrayBuffer(file.slice(offset, offset + chunkSize));
            };

            readNextChunk();
        },

        processZipFile(file, onComplete) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    if (this.shouldStop) {
                        this.isProcessing = false;
                        onComplete();
                        return;
                    }

                    const zip = await JSZip.loadAsync(e.target.result);
                    const entries = Object.values(zip.files).filter(entry => !entry.dir);
                    entries.sort((a, b) => a.name.localeCompare(b.name));

                    // 使用 Promise.all 并行处理所有文件
                    await Promise.all(entries.map(async (entry) => {
                        if (this.shouldStop || this.resultLineCount >= this.outputLimit) {
                            return;
                        }

                        try {
                            const blob = await entry.async('blob');
                            const zipFile = new File([blob], entry.name, {type: 'file'});
                            const fullName = `${file.name}/${entry.name}`;
                            
                            await new Promise((resolve) => {
                                this.processTextFile(zipFile, () => {
                                    resolve();
                                }, fullName);
                            });
                        } catch (error) {
                            console.error(`Error processing entry ${entry.name}:`, error);
                        }
                    }));

                    onComplete();
                } catch (error) {
                    console.error('Error processing ZIP file:', error);
                    onComplete();
                } finally {
                    // 在 finally 块中设置 isProcessing，确保总是被执行
                    this.isProcessing = false;
                }
            };

            reader.onerror = () => {
                console.error('Error reading ZIP file');
                this.isProcessing = false;
                onComplete();
            };

            reader.readAsArrayBuffer(file);
        },

        processTextFile(file, onComplete, fullName = null) {
            const chunkSize = 1024 * 1024;
            let offset = 0;
            const reader = new FileReader();

            reader.onload = e => {
                if (this.shouldStop || this.resultLineCount >= this.outputLimit) {
                    this.isProcessing = false;
                    onComplete();
                    return;
                }

                this.processChunk(e.target.result, fullName || file.name);
                offset += chunkSize;
                if (offset < file.size) {
                    readNextChunk();
                } else {
                    onComplete();
                }
            };

            const readNextChunk = () => {
                reader.readAsText(file.slice(offset, offset + chunkSize));
            };

            readNextChunk();
        },

        processChunk(chunk, fileName) {
            const { includeRegexes, excludeRegexes, hideRegexes } = this.buildRegexes();
            const lines = chunk.split("\n");
            
            lines.forEach((line, index) => {
                if (this.shouldStop || this.resultLineCount >= this.outputLimit) return;
                
                if (this.isContextSearch) {
                    // 上下文搜索模式
                    // 使用 trim() 来忽略前后空格的差异
                    if (line.trim() === this._contextSearchLine.trim()) {
                        console.log('Found matching line:', line);  // 调试日志
                        
                        // 找到匹配行，获取其上下文
                        const start = Math.max(0, index - this.contextLines);
                        const end = Math.min(lines.length, index + this.contextLines + 1);
                        
                        for (let i = start; i < end; i++) {
                            const contextLine = lines[i];
                            // 传递 isMatchedLine 标记
                            this.writeLine(contextLine, { 
                                fileName,
                                isMatchedLine: i === index  // 使用索引比较而不是内容比较
                            });
                        }
                    }
                } else {
                    // 普通搜索模式
                    this.processLine(line, includeRegexes, excludeRegexes, hideRegexes, fileName);
                }
            });
        },

        writeLine(line, context) {
            let resultDiv = document.getElementById(`result-${this.activeTab}`);
            
            if (!resultDiv) {
                resultDiv = document.createElement('div');
                resultDiv.id = `result-${this.activeTab}`;
                resultDiv.className = 'result-container';
                document.querySelector('.results-content').appendChild(resultDiv);
            }

            const lineDiv = document.createElement('div');
            const textPre = document.createElement('pre');
            textPre.style.margin = '0';
            textPre.style.display = 'inline';
            textPre.textContent = line;
            lineDiv.appendChild(textPre);

            if (context?.fileName) {
                lineDiv.title = `From: ${context.fileName}`;
            }

            // 只在主标签页显示上下文按钮
            if (this.activeTab === 'main') {
                lineDiv.onclick = () => {
                    document.querySelectorAll('.context-button').forEach(btn => btn.remove());
                    
                    const contextButton = document.createElement('button');
                    contextButton.className = 'context-button secondary outline';
                    contextButton.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8M1.173 8a13 13 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5s3.879 1.168 5.168 2.457A13 13 0 0 1 14.828 8q-.086.13-.195.288c-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5s-3.879-1.168-5.168-2.457A13 13 0 0 1 1.172 8z"/>
                            <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0"/>
                        </svg>
                        View Context
                    `;
                    contextButton.onclick = (e) => {
                        e.stopPropagation();
                        this.viewContextInNewTab(line, context?.fileName);
                    };
                    lineDiv.appendChild(contextButton);
                };
            }

            resultDiv.appendChild(lineDiv);
            this.resultLineCount++;
        },

        showContext(lineIndex, contextLines, clickedDiv, fileName) {
            // 移除现有的上下文行
            document.querySelectorAll('.context-line').forEach(div => div.remove());
            document.querySelectorAll('.context-button').forEach(btn => btn.remove());

            const contextStart = parseInt(clickedDiv.dataset.contextStart);
            const lines = JSON.parse(clickedDiv.dataset.contextLines);
            const currentLineIndex = lineIndex - contextStart;

            // 显示前面的上下文行
            const beforeLines = lines.slice(0, currentLineIndex);
            // 显示后面的上下文行
            const afterLines = lines.slice(currentLineIndex + 1);

            // 插入后面的上下文（先插入后面的，这样前面的插入不会影响位置）
            afterLines.forEach((line, i) => {
                const contextDiv = document.createElement('div');
                contextDiv.className = 'context-line';
                const textPre = document.createElement('pre');
                textPre.style.margin = '0';
                textPre.style.display = 'inline';
                textPre.textContent = line;
                contextDiv.appendChild(textPre);
                
                if (fileName) {
                    contextDiv.title = `From: ${fileName}`;
                }
                contextDiv.style.opacity = '0';
                contextDiv.style.transform = 'translateY(-10px)';
                
                // 插入到当前行的后面
                clickedDiv.parentNode.insertBefore(contextDiv, clickedDiv.nextSibling);
                
                // 触发动画
                setTimeout(() => {
                    contextDiv.style.transition = 'all 0.3s ease';
                    contextDiv.style.opacity = '0.7';
                    contextDiv.style.transform = 'translateY(0)';
                }, 50 * i);
            });

            // 插入前面的上下文
            beforeLines.reverse().forEach((line, i) => {
                const contextDiv = document.createElement('div');
                contextDiv.className = 'context-line';
                const textPre = document.createElement('pre');
                textPre.style.margin = '0';
                textPre.style.display = 'inline';
                textPre.textContent = line;
                contextDiv.appendChild(textPre);
                
                if (fileName) {
                    contextDiv.title = `From: ${fileName}`;
                }
                contextDiv.style.opacity = '0';
                contextDiv.style.transform = 'translateY(10px)';
                
                // 插入到当前行的前面
                clickedDiv.parentNode.insertBefore(contextDiv, clickedDiv);
                
                // 触发动画
                setTimeout(() => {
                    contextDiv.style.transition = 'all 0.3s ease';
                    contextDiv.style.opacity = '0.7';
                    contextDiv.style.transform = 'translateY(0)';
                }, 50 * i);
            });
        },

        sortResult(direction) {
            const resultDiv = document.getElementById('result');
            // Save both text content and file name
            const lines = Array.from(resultDiv.children).map(div => ({
                text: div.textContent,
                fileName: div.title.replace('From: ', '')  // Extract original file name
            }));
            
            // Sort by text content
            lines.sort((a, b) => direction === 'asc' ? 
                a.text.localeCompare(b.text) : 
                b.text.localeCompare(a.text)
            );
            
            this.clearResult();
            // Restore both text and file name
            lines.forEach(line => this.writeLine(line.text, line.fileName));
        },

        saveResult() {
            const resultDiv = document.getElementById('result');
            const lines = Array.from(resultDiv.children).map(div => {
                const fileName = div.title ? ` [${div.title.replace('From: ', '')}]` : '';
                return `${div.textContent}${fileName}`;
            });
            
            const content = lines.join('\n');
            const blob = new Blob([content], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = 'grep_result.txt';
            document.body.appendChild(a);
            a.click();
            
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        },

        copyToInput() {
            const resultDiv = document.getElementById('result');
            const lines = Array.from(resultDiv.children).map(div => div.textContent);
            this.textInput = lines.join('\n');
            this.inputMethod = 'text';
        },

        closeTab(tabId) {
            const index = this.tabs.findIndex(tab => tab.id === tabId);
            if (index !== -1) {
                this.tabs.splice(index, 1);
                // 如果关闭的是当前标签，切换到主标签
                if (this.activeTab === tabId) {
                    this.activeTab = 'main';
                }
                // 清理该标签的结果容器
                const resultContainer = document.getElementById(`result-${tabId}`);
                if (resultContainer) {
                    resultContainer.innerHTML = '';
                }
            }
        },

        viewContextInNewTab(line, fileName) {
            console.log('Starting context search for line:', line);
            
            // 创建新标签
            const tabId = 'context-' + Date.now();
            const tabTitle = `Context: ${line.substring(0, 30)}${line.length > 30 ? '...' : ''}`;
            this.tabs.push({ id: tabId, title: tabTitle });
            
            // 切换到新标签并重置计数
            this.activeTab = tabId;
            this.resultLineCount = 0;
            
            // 清除所有用户输入
            this.includeInput = '';
            this.excludeInput = '';
            this.hideInput = '';
            
            // 设置上下文搜索参数
            this.contextLines = 50;
            this._contextSearchLine = line.trim();
            this.isContextSearch = true;
            
            // 执行搜索
            this.renderResult();
            
            // 在搜索完成后应用高亮
            setTimeout(() => {
                const resultDiv = document.getElementById(`result-${tabId}`);
                if (resultDiv) {
                    const lines = resultDiv.children;
                    for (let lineDiv of lines) {
                        const lineContent = lineDiv.textContent.trim();
                        if (lineContent === this._contextSearchLine.trim()) {
                            lineDiv.classList.add('matched-line');
                            lineDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            break;  // 找到第一个匹配就停止
                        }
                    }
                }
                
                // 清理上下文搜索状态
                this.contextLines = 0;
                this.isContextSearch = false;
                this._contextSearchLine = null;
            }, 100);  // 给搜索一些时间完成
        }
    }))
})