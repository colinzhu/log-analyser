# Log Analyser

A web-based log file analysis tool that allows you to search, filter, and analyze log files directly in your browser. Also available as a Chrome extension.

![image](https://github.com/colinzhu/resources/blob/master/log-analyser/screenshot-1.png?raw=true)


## Features

- **Multiple Input Methods**
  - File Input: Multiple files support (.txt, .log, .gz, .zip)
  - Text Input: Direct text paste
  - URL Input (Chrome Extension): Multiple URLs support (one per line)

- **Powerful Filtering**
  - Include keywords (AND logic)
  - Exclude keywords
  - Text hiding/masking
  - Case-sensitive/insensitive options

- **Context View**
  - Configurable context lines (up to 500 lines)
  - Double-click on matched line to show context
  - Context lines are highlighted differently
  - File source tracking for each line

- **Result Management**
  - Configurable output limit
  - Sorting (A-Z, Z-A)
  - Line wrapping toggle
  - Copy results to text input
  - Save results to file
  - File source tracking (hover to see source file)

- **Browser-based Processing**
  - No server required
  - Files are processed locally
  - Chunk-based processing for large files
  - Memory efficient using IndexedDB for context storage

## Chrome Extension Features
- Quick access from toolbar
- Current tab URL auto-fill
- Multiple URLs processing
- Cross-origin requests support

## Usage

1. **Input Selection**
   - Choose between file input, text input, or URL input (Chrome Extension)
   - For files: select one or multiple files (.txt, .log, .gz, .zip)
   - For text: paste directly into the text area
   - For URLs: enter multiple URLs (one per line)

2. **Filter Configuration**
   - Include Keywords: Lines must contain ALL specified keywords
   - Exclude Keywords: Lines containing ANY of these will be excluded
   - Hide Text: Specified text will be hidden/masked in the output
   - Toggle case sensitivity for each filter type

3. **Context Configuration**
   - Select number of context lines (0-500)
   - Double-click on any matched line to view context
   - Double-click again to hide context

4. **Output Control**
   - Set maximum number of output lines
   - Sort results alphabetically
   - Toggle line wrapping
   - Save results to file
   - Copy results to text input
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

## Chrome Extension Installation

1. Clone the repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the repository folder

## Browser Support

Works in modern browsers that support:
- ES6+ JavaScript
- File API
- IndexedDB
- Promises and async/await

