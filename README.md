# Log Analyser

A web-based log file analysis tool that allows you to search, filter, and analyze log files directly in your browser.

## Features

- **Multiple File Support**
  - Plain text files (.txt, .log)
  - Gzip compressed files (.gz)
  - ZIP archives (.zip)
  - Multiple files can be processed in sequence

- **Powerful Filtering**
  - Include keywords (AND logic)
  - Exclude keywords
  - Text hiding/masking
  - Case-sensitive/insensitive options

- **Result Management**
  - Configurable output limit
  - Sorting (A-Z, Z-A)
  - Line wrapping toggle
  - File source tracking (hover to see source file)

- **Browser-based Processing**
  - No server required
  - Files are processed locally
  - Chunk-based processing for large files
  - Memory efficient

## Usage

1. **Input Selection**
   - Choose between file input or direct text input
   - For files: select one or multiple files (.txt, .log, .gz, .zip)
   - For text: paste directly into the text area

2. **Filter Configuration**
   - Include Keywords: Lines must contain ALL specified keywords
   - Exclude Keywords: Lines containing ANY of these will be excluded
   - Hide Text: Specified text will be hidden/masked in the output
   - Toggle case sensitivity for each filter type

3. **Output Control**
   - Set maximum number of output lines
   - Sort results alphabetically
   - Toggle line wrapping
   - Hover over lines to see source file name

## Dependencies

- [Alpine.js](https://alpinejs.dev/) - For reactive data handling
- [Pako](https://github.com/nodeca/pako) - For .gz file processing
- [JSZip](https://stuk.github.io/jszip/) - For .zip file processing
- [Pico CSS](https://picocss.com/) - For styling

## Local Development

1. Clone the repository
2. Open `index.html` in a browser
3. No build process required

## Browser Support

Works in modern browsers that support:
- ES6+ JavaScript
- File API
- Promises and async/await

