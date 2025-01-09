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
        resultLineCount: -1,
        isWrap: false,
        outputLimit: 1000,
        isProcessing: false,

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
            this.resultLineCount = -1;
        },

        toggleWrap() {
            this.isWrap = !this.isWrap;
        },

        clearResult() {
            document.getElementById('result').innerHTML = '';
            this.resultLineCount = 0;
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

            for (let line of lines) {
                if (this.shouldStop || this.resultLineCount >= this.outputLimit) break;
                this.processLine(line, includeRegexes, excludeRegexes, hideRegexes, fileName);
            }
        },

        writeLine(line, fileName) {
            const resultDiv = document.getElementById('result');
            const lineDiv = document.createElement('div');
            lineDiv.textContent = line;
            if (fileName) {
                lineDiv.title = `From: ${fileName}`;
            }
            resultDiv.appendChild(lineDiv);
            this.resultLineCount++;
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
        }
    }))
})