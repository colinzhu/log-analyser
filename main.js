document.addEventListener('alpine:init', () => {
    Alpine.data('appData', () => ({
        fileInput: null,
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

        clearResult() {
            document.getElementById('result').innerHTML = '';
            this.resultLineCount = 0;
        },

        renderResult() {
            this.clearResult();
            this.isProcessing = true;
            if (this.fileInput) {
                this.renderFromFileInput();
            } else {
                this.renderFromTextInput();
            }
        },

        renderFromTextInput() {
            const includeKeywords = this.includeInput.trim().split(" ").filter(Boolean);
            const excludeKeywords = this.excludeInput.trim().split(" ").filter(Boolean);
            const hideTexts = this.hideInput.trim().split(" ").filter(Boolean);

            const includeRegexFlags = this.includeInputCase ? 'i' : '';
            const excludeRegexFlags = this.excludeInputCase ? 'i' : '';
            const hideRegexFlags = this.hideInputCase ? 'i' : '';
            const includeRegexes = includeKeywords.map(key => new RegExp(key, includeRegexFlags));
            const excludeRegexes = excludeKeywords.map(key => new RegExp(key, excludeRegexFlags));
            const hideRegexes = hideTexts.map(key => new RegExp(key, hideRegexFlags));

            const lines = this.textInput.split("\n");

            for (let line of lines) {
                if (this.resultLineCount >= this.outputLimit) break;

                let include = includeRegexes.every(regex => regex.test(line));
                let exclude = excludeRegexes.every(regex => !regex.test(line));

                if (include && exclude) {
                    for (let regex of hideRegexes) {
                        line = line.replace(regex, "");
                    }
                    this.writeLine(line);
                }
            }
            this.isProcessing = false;
        },

        onFileChanged(event) {
            const file = event.target.files[0];
            if (file) {
                this.fileInput = file;
                this.textInput = '';
            }
        },

        renderFromFileInput() {
            const file = this.fileInput;
            const fileName = file.name.toLowerCase();

            if (fileName.endsWith('.gz')) {
                this.processGzFile(file);
            } else if (fileName.endsWith('.zip')) {
                this.processZipFile(file);
            } else {
                this.processTextFile(file);
            }
        },

        processGzFile(file) {
            const chunkSize = 1024 * 1024; // 1MB chunks
            let offset = 0;
            const reader = new FileReader();
            const gunzip = new pako.Inflate({to: 'string'});

            gunzip.onData = (chunk) => {
                this.processChunk(chunk);
                if (this.resultLineCount >= this.outputLimit) {
                    reader.abort();
                    this.isProcessing = false;
                }
            };

            reader.onload = (e) => {
                gunzip.push(new Uint8Array(e.target.result), false);
                offset += chunkSize;
                if (offset < file.size && this.resultLineCount < this.outputLimit) {
                    readNextChunk();
                } else {
                    gunzip.push(new Uint8Array(), true); // signal the end of the stream
                    this.isProcessing = false;
                }
            };

            reader.onerror = (e) => {
                console.error("Error reading file:", e);
            };

            const readNextChunk = () => {
                const blob = file.slice(offset, offset + chunkSize);
                reader.readAsArrayBuffer(blob);
            };

            readNextChunk();
        },

        processZipFile(file) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const zip = await JSZip.loadAsync(e.target.result);

                zip.forEach(async (relativePath, zipEntry) => {
                    if (zipEntry.dir) return;
                    const file = new File([await zipEntry.async('blob')], zipEntry.name, {type: 'file'});
                    this.processTextFile(file);
                });
            };
            reader.readAsArrayBuffer(file);
        },

        processTextFile(file) {
            const chunkSize = 1024 * 1024; // 1MB chunks
            let offset = 0;
            const reader = new FileReader();

            reader.onload = (e) => {
                if (this.resultLineCount >= this.outputLimit) {
                    this.isProcessing = false;
                    return;
                }

                const chunk = e.target.result;
                this.processChunk(chunk);
                offset += chunkSize;
                if (offset < file.size) {
                    readNextChunk();
                } else {
                    this.isProcessing = false;
                }
            };
            const readNextChunk = () => {
                const blob = file.slice(offset, offset + chunkSize);
                reader.readAsText(blob);
            };
            readNextChunk();
        },

        processChunk(chunk) {
            const includeKeywords = this.includeInput.trim().split(" ").filter(Boolean);
            const excludeKeywords = this.excludeInput.trim().split(" ").filter(Boolean);
            const hideTexts = this.hideInput.trim().split("~").filter(Boolean);

            const includeRegexFlags = this.includeInputCase ? 'i' : '';
            const excludeRegexFlags = this.excludeInputCase ? 'i' : '';
            const hideRegexFlags = this.hideInputCase ? 'i' : '';

            const includeRegexes = includeKeywords.map(key => new RegExp(key, includeRegexFlags));
            const excludeRegexes = excludeKeywords.map(key => new RegExp(key, excludeRegexFlags));
            const hideRegexes = hideTexts.map(key => new RegExp(key, hideRegexFlags));

            const lines = chunk.split("\n");

            for (let line of lines) {
                if (this.resultLineCount >= this.outputLimit) break;

                let include = includeRegexes.every(regex => regex.test(line));
                let exclude = excludeRegexes.every(regex => !regex.test(line));

                if (include && exclude) {
                    for (let regex of hideRegexes) {
                        line = line.replace(regex, "");
                    }
                    this.writeLine(line);
                }
            }
            console.log("this.resultLineCount", this.resultLineCount);
        },

        writeLine(line) {
            const resultDiv = document.getElementById('result');
            const lineDiv = document.createElement('div');
            lineDiv.textContent = line;
            resultDiv.appendChild(lineDiv);
            this.resultLineCount = this.resultLineCount + 1;
        },

        sortResult(sorting) {
            const resultDiv = document.getElementById('result');
            const lines = Array.from(resultDiv.children).map(div => div.textContent);
            lines.sort((a, b) => {
                if (sorting === 'asc') {
                    return a.localeCompare(b);
                } else {
                    return b.localeCompare(a);
                }
            });
            this.clearResult();
            lines.forEach(line => this.writeLine(line));
        },

    }))
})