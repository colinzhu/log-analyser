document.addEventListener('alpine:init', () => {
    // 初始化 IndexedDB
    let db;
    const initDB = () => {
        const request = indexedDB.open('LogGrepDB', 1);
        
        request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.error);
        };
        
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains('contextLines')) {
                const store = db.createObjectStore('contextLines', { keyPath: 'id', autoIncrement: true });
                store.createIndex('lineNumber', 'lineNumber', { unique: false });
                store.createIndex('fileName', 'fileName', { unique: false });
            }
        };
        
        request.onsuccess = (event) => {
            db = event.target.result;
        };
    };
    
    initDB();

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
        resultLineCount: -1,
        isWrap: false,
        outputLimit: 1000,
        contextLimit: 0,
        isProcessing: false,
        selectedLineId: null,
        urlInput: '',
        isChromeExtension: false,

        init() {
            // 从 URL 参数中获取初始值
            const params = new URLSearchParams(window.location.search);
            const initialInputMethod = params.get('inputMethod');
            const initialUrl = params.get('url');
            const isChromeExtension = params.get('isChromeExtension');
            if (initialInputMethod) {
                this.inputMethod = initialInputMethod;
            }
            
            if (initialUrl) {
                this.urlInput = initialUrl;
            }
            
            if (isChromeExtension) {
                this.isChromeExtension = true;
            }
        },

        // Setters
        setInputMethod() {
            this.inputMethod = this.$el.value;
        },

        setTextInput() {
            this.textInput = this.$el.value;
        },

        setUrlInput() {
            this.urlInput = this.$el.value;
        },

        setIncludeInput() {
            this.includeInput = this.$el.value;
        },

        setIncludeInputCase() {
            this.includeInputCase = this.$el.checked;
        },

        setExcludeInput() {
            this.excludeInput = this.$el.value;
        },

        setExcludeInputCase() {
            this.excludeInputCase = this.$el.checked;
        },

        setHideInput() {
            this.hideInput = this.$el.value;
        },

        setHideInputCase() {
            this.hideInputCase = this.$el.checked;
        },

        setOutputLimit() {
            this.outputLimit = parseInt(this.$el.value);
        },

        setContextLimit() {
            this.contextLimit = parseInt(this.$el.value);
        },

        // Computed properties
        showProcessingButton() {
            return this.isProcessing;
        },

        showResultActions() {
            return this.resultLineCount > 0;
        },

        showResults() {
            return this.resultLineCount > -1;
        },

        showSelectedFiles() {
            return this.files.length > 1;
        },

        isSearchDisabled() {
            return this.isProcessing || 
                   (this.inputMethod === 'file' && !this.fileInput) || 
                   (this.inputMethod === 'text' && !this.textInput) || 
                   (this.inputMethod === 'url' && !this.urlInput);
        },

        getWrapStyle() {
            return this.isWrap ? 'white-space: pre-wrap' : 'white-space: pre';
        },

        getWrapButtonText() {
            return this.isWrap ? 'Nowrap' : 'Wrap';
        },

        isFileInputDisabled() {
            return this.inputMethod !== 'file';
        },

        isTextInputDisabled() {
            return this.inputMethod !== 'text';
        },

        isUrlInputDisabled() {
            return this.inputMethod !== 'url';
        },
        isInputMethodChecked() {
            return this.inputMethod === this.$el.value;
        },
        isOutputLimitSelected() {
            return this.outputLimit === parseInt(this.$el.value);
        },
        isContextLimitSelected() {
            return this.contextLimit === parseInt(this.$el.value);
        },

        // Methods
        clearContextStore() {
            const transaction = db.transaction(['contextLines'], 'readwrite');
            const store = transaction.objectStore('contextLines');
            store.clear();
        },

        async showContext(lineId) {
            if (!db || this.contextLimit <= 0) return;
            
            // 如果点击的是同一行，则隐藏上下文
            if (this.selectedLineId === lineId) {
                document.querySelectorAll('.context-line').forEach(el => el.remove());
                document.querySelectorAll('.matched-line').forEach(el => el.classList.remove('selected'));
                this.selectedLineId = null;
                return;
            }

            // 移除之前的上下文行和选中状态
            document.querySelectorAll('.context-line').forEach(el => el.remove());
            document.querySelectorAll('.matched-line').forEach(el => el.classList.remove('selected'));
            
            // 设置新的选中行
            this.selectedLineId = lineId;
            const clickedDiv = document.querySelector(`[data-line-id="${lineId}"]`);
            if (clickedDiv) {
                clickedDiv.classList.add('selected');
            }

            const transaction = db.transaction(['contextLines'], 'readonly');
            const store = transaction.objectStore('contextLines');
            const request = store.get(parseInt(lineId));

            request.onsuccess = (event) => {
                const data = event.target.result;
                if (!data || !clickedDiv) return;

                // 按相对位置排序上下文行
                const contextLines = data.contextLines
                    .filter(line => line.relativePosition !== 0)  // 排除匹配行本身
                    .filter(line => Math.abs(line.relativePosition) <= this.contextLimit)  // 限制上下文范围
                    .sort((a, b) => a.relativePosition - b.relativePosition);  // 按相对位置排序

                // 分离前后上下文行
                const beforeLines = contextLines.filter(line => line.relativePosition < 0);
                const afterLines = contextLines.filter(line => line.relativePosition > 0);

                // 创建一个文档片段来提高性能
                const fragment = document.createDocumentFragment();
                
                // 先添加前面的上下文行（按照从上到下的顺序）
                beforeLines.forEach(({text}) => {
                    const contextDiv = document.createElement('div');
                    contextDiv.className = 'context-line';
                    contextDiv.textContent = text;
                    if (data.fileName) {
                        contextDiv.title = `From: ${data.fileName}`;
                    }
                    fragment.appendChild(contextDiv);
                });

                // 添加匹配的行的克隆
                const matchedLine = document.createElement('div');
                matchedLine.className = 'matched-line selected';
                matchedLine.textContent = data.matchedLine;
                matchedLine.dataset.lineId = lineId;
                if (data.fileName) {
                    matchedLine.title = `From: ${data.fileName}`;
                }
                // 重要：确保绑定双击事件
                matchedLine.ondblclick = () => this.showContext(lineId);
                fragment.appendChild(matchedLine);

                // 添加后面的上下文行
                afterLines.forEach(({text}) => {
                    const contextDiv = document.createElement('div');
                    contextDiv.className = 'context-line';
                    contextDiv.textContent = text;
                    if (data.fileName) {
                        contextDiv.title = `From: ${data.fileName}`;
                    }
                    fragment.appendChild(contextDiv);
                });

                // 替换原始的匹配行
                clickedDiv.parentNode.insertBefore(fragment, clickedDiv);
                clickedDiv.remove();
            };
        },

        stopProcessing() {
            this.shouldStop = true;
            this.isProcessing = false;
        },

        reset() {
            this.inputMethod = 'file';
            this.textInput = '';
            this.urlInput = '';
            this.fileInput = null;
            this.clearResult();
            document.getElementById('fileInput').value = '';
            this.shouldStop = false;
            this.resultLineCount = -1;
        },

        toggleWrap() {
            this.isWrap = !this.isWrap;
        },

        clearResult() {
            document.getElementById('result').innerHTML = '';
            this.resultLineCount = 0;
        },

        async renderResult() {
            this.clearResult();
            this.clearContextStore();
            this.isProcessing = true;
            this.shouldStop = false;
            this.selectedLineId = null;

            if (this.inputMethod === 'url') {
                try {
                    const response = await fetch(this.urlInput);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    const blob = await response.blob();
                    const fileName = this.urlInput.split('?')[0].split('/').pop() || 'downloaded.log';
                    const file = new File([blob], fileName);
                    
                    this.files = [file];
                    this.renderFromFileInput();
                } catch (error) {
                    console.error('Error fetching URL:', error);
                    const resultDiv = document.getElementById('result');
                    resultDiv.innerHTML = `<div class="error">Error fetching URL: ${error.message}</div>`;
                } finally {
                    this.isProcessing = false;
                }
            } else {
                this.inputMethod === 'file' ? this.renderFromFileInput() : this.renderFromTextInput();
            }
        },

        renderFromTextInput() {
            const { includeRegexes, excludeRegexes, hideRegexes } = this.buildRegexes();
            const lines = this.textInput.split("\n");

            // 使用与文件处理相同的逻辑
            if (this.contextLimit > 0) {
                // 先找到所有匹配的行
                const matchedIndexes = [];
                lines.forEach((line, index) => {
                    if (this.resultLineCount >= this.outputLimit) return;
                    
                    const include = includeRegexes.every(regex => regex.test(line));
                    const exclude = excludeRegexes.every(regex => !regex.test(line));
                    
                    if (include && exclude) {
                        matchedIndexes.push(index);
                    }
                });

                // 处理每个匹配的行及其上下文
                for (const index of matchedIndexes) {
                    if (this.resultLineCount >= this.outputLimit) break;

                    const line = lines[index];
                    let processedLine = line;
                    hideRegexes.forEach(regex => {
                        processedLine = processedLine.replace(regex, "");
                    });

                    // 存储上下文到 IndexedDB
                    const contextStart = Math.max(0, index - this.contextLimit);
                    const contextEnd = Math.min(lines.length - 1, index + this.contextLimit);
                    
                    // 创建带有相对位置的上下文行数组
                    const contextLines = [];
                    for (let i = contextStart; i <= contextEnd; i++) {
                        contextLines.push({
                            text: lines[i],
                            relativePosition: i - index  // 相对于匹配行的位置
                        });
                    }

                    const lineId = this.resultLineCount + 1;
                    const transaction = db.transaction(['contextLines'], 'readwrite');
                    const store = transaction.objectStore('contextLines');

                    store.add({
                        id: lineId,
                        fileName: null,
                        contextLines: contextLines,
                        matchedLine: line
                    });

                    // 写入匹配的行
                    const resultDiv = document.getElementById('result');
                    const lineDiv = document.createElement('div');
                    lineDiv.textContent = processedLine;
                    lineDiv.className = 'matched-line';
                    lineDiv.dataset.lineId = lineId;
                    lineDiv.ondblclick = () => this.showContext(lineId);

                    resultDiv.appendChild(lineDiv);
                    this.resultLineCount++;
                }
            } else {
                // 如果不需要上下文，使用原来的逻辑
                for (let line of lines) {
                    if (this.resultLineCount >= this.outputLimit) break;
                    this.processLine(line, includeRegexes, excludeRegexes, hideRegexes);
                }
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
            const include = includeRegexes.every(regex => regex.test(line));
            const exclude = excludeRegexes.every(regex => !regex.test(line));

            if (include && exclude) {
                hideRegexes.forEach(regex => {
                    line = line.replace(regex, "");
                });
                this.writeLine(line, fileName);
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
                            const zipFile = new File([blob], entry.name);
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
            
            // 如果需要上下文，存储所有行
            if (this.contextLimit > 0) {
                // 先找到所有匹配的行
                const matchedIndexes = [];
                lines.forEach((line, index) => {
                    if (this.shouldStop || this.resultLineCount >= this.outputLimit) return;
                    
                    const include = includeRegexes.every(regex => regex.test(line));
                    const exclude = excludeRegexes.every(regex => !regex.test(line));
                    
                    if (include && exclude) {
                        matchedIndexes.push(index);
                    }
                });

                // 处理每个匹配的行及其上下文
                for (const index of matchedIndexes) {
                    if (this.shouldStop || this.resultLineCount >= this.outputLimit) break;

                    const line = lines[index];
                    let processedLine = line;
                    hideRegexes.forEach(regex => {
                        processedLine = processedLine.replace(regex, "");
                    });

                    // 存储上下文到 IndexedDB
                    const contextStart = Math.max(0, index - this.contextLimit);
                    const contextEnd = Math.min(lines.length - 1, index + this.contextLimit);
                    
                    // 创建带有相对位置的上下文行数组
                    const contextLines = [];
                    for (let i = contextStart; i <= contextEnd; i++) {
                        contextLines.push({
                            text: lines[i],
                            relativePosition: i - index  // 相对于匹配行的位置
                        });
                    }

                    const lineId = this.resultLineCount + 1;
                    const transaction = db.transaction(['contextLines'], 'readwrite');
                    const store = transaction.objectStore('contextLines');

                    store.add({
                        id: lineId,
                        fileName: fileName,
                        contextLines: contextLines,
                        matchedLine: line
                    });

                    // 写入匹配的行
                    const resultDiv = document.getElementById('result');
                    const lineDiv = document.createElement('div');
                    lineDiv.textContent = processedLine;
                    lineDiv.className = 'matched-line';
                    
                    if (fileName) {
                        lineDiv.title = `From: ${fileName}`;
                    }

                    lineDiv.dataset.lineId = lineId;
                    lineDiv.ondblclick = () => this.showContext(lineId);

                    resultDiv.appendChild(lineDiv);
                    this.resultLineCount++;
                }
            } else {
                // 如果不需要上下文，直接处理每一行
                lines.forEach(line => {
                    if (this.shouldStop || this.resultLineCount >= this.outputLimit) return;
                    this.processLine(line, includeRegexes, excludeRegexes, hideRegexes, fileName);
                });
            }
        },

        writeLine(line, fileName) {
            const resultDiv = document.getElementById('result');
            const lineDiv = document.createElement('div');
            lineDiv.textContent = line;
            lineDiv.className = 'matched-line';
            
            if (fileName) {
                lineDiv.title = `From: ${fileName}`;
            }

            // 只有在需要上下文时才添加双击事件
            if (this.contextLimit > 0) {
                const lineId = this.resultLineCount + 1;
                lineDiv.dataset.lineId = lineId;
                lineDiv.ondblclick = () => this.showContext(lineId);
            }

            resultDiv.appendChild(lineDiv);
            this.resultLineCount++;
        },

        sortResult() {
            const direction = this.$el.value;
            const resultDiv = document.getElementById('result');
            // 移除所有上下文行
            document.querySelectorAll('.context-line').forEach(el => el.remove());

            // 保存文本内容和文件名
            const lines = Array.from(resultDiv.children).map(div => ({
                text: div.textContent,
                fileName: div.title.replace('From: ', ''),
                lineId: div.dataset.lineId,
                isSelected: div.classList.contains('selected')
            }));
            
            // 按文本内容排序
            lines.sort((a, b) => direction === 'asc' ? 
                a.text.localeCompare(b.text) : 
                b.text.localeCompare(a.text)
            );
            
            // 清除当前结果
            resultDiv.innerHTML = '';
            
            // 重新渲染排序后的结果
            lines.forEach(line => {
                const lineDiv = document.createElement('div');
                lineDiv.textContent = line.text;
                lineDiv.className = 'matched-line';
                if (line.isSelected) {
                    lineDiv.classList.add('selected');
                }
                if (line.fileName) {
                    lineDiv.title = `From: ${line.fileName}`;
                }
                if (line.lineId) {
                    lineDiv.dataset.lineId = line.lineId;
                    lineDiv.ondblclick = () => this.showContext(line.lineId);
                }
                resultDiv.appendChild(lineDiv);
            });
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
        }
    }))
})