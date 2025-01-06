document.addEventListener('alpine:init', () => {
    Alpine.data('appData', () => ({
        // State
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

        // Methods
        reset() {
            this.inputMethod = 'file';
            this.textInput = '';
            this.fileInput = null;
            this.clearResult();
            document.getElementById('fileInput').value = '';
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

        processLine(line, includeRegexes, excludeRegexes, hideRegexes) {
            const include = includeRegexes.every(regex => regex.test(line));
            const exclude = excludeRegexes.every(regex => !regex.test(line));

            if (include && exclude) {
                hideRegexes.forEach(regex => {
                    line = line.replace(regex, "");
                });
                this.writeLine(line);
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
                this.processChunk(chunk);
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
            reader.onload = async e => {
                const zip = await JSZip.loadAsync(e.target.result);
                const entries = Object.values(zip.files).filter(entry => !entry.dir);
                
                // Sort zip entries by name
                entries.sort((a, b) => a.name.localeCompare(b.name));

                const processZipEntry = async (index) => {
                    if (index >= entries.length || this.resultLineCount >= this.outputLimit) {
                        onComplete();
                        return;
                    }

                    const entry = entries[index];
                    const content = await entry.async('blob');
                    const zipFile = new File([content], entry.name);
                    
                    await this.processTextFile(zipFile, () => {
                        processZipEntry(index + 1);
                    });
                };

                processZipEntry(0);
            };
            reader.readAsArrayBuffer(file);
        },

        processTextFile(file, onComplete) {
            const chunkSize = 1024 * 1024;
            let offset = 0;
            const reader = new FileReader();

            reader.onload = e => {
                if (this.resultLineCount >= this.outputLimit) {
                    this.isProcessing = false;
                    onComplete();
                    return;
                }

                this.processChunk(e.target.result);
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

        processChunk(chunk) {
            const { includeRegexes, excludeRegexes, hideRegexes } = this.buildRegexes();
            const lines = chunk.split("\n");

            for (let line of lines) {
                if (this.resultLineCount >= this.outputLimit) break;
                this.processLine(line, includeRegexes, excludeRegexes, hideRegexes);
            }
        },

        writeLine(line) {
            const resultDiv = document.getElementById('result');
            const lineDiv = document.createElement('div');
            lineDiv.textContent = line;
            resultDiv.appendChild(lineDiv);
            this.resultLineCount++;
        },

        sortResult(direction) {
            const resultDiv = document.getElementById('result');
            const lines = Array.from(resultDiv.children).map(div => div.textContent);
            lines.sort((a, b) => direction === 'asc' ? a.localeCompare(b) : b.localeCompare(a));
            this.clearResult();
            lines.forEach(line => this.writeLine(line));
        }
    }))
})