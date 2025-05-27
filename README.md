# React Circular Dependency Analyzer

[![npm version](https://badge.fury.io/js/%40webtoon-today%2Freact-circular-dependency-analyzer.svg)](https://badge.fury.io/js/%40webtoon-today%2Freact-circular-dependency-analyzer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A comprehensive static analysis tool to detect circular state dependencies in React projects that can cause infinite re-renders, memory leaks, and performance issues.

## 🚀 Features

- 🔍 **Static Analysis**: Analyzes React components without running your code
- 📊 **Interactive Web UI**: Beautiful D3.js visualizations with pan/zoom support
- 🔄 **Circular Detection**: Finds complex circular dependencies between state updates
- 🎯 **Multi-Framework Support**: React, React Native, TypeScript, and Recoil
- 📈 **Progress Tracking**: Real-time analysis progress with file-by-file updates
- 🎨 **Multiple Layouts**: Force-directed, bipartite, and hierarchical graph layouts
- ⚙️ **Smart Filtering**: Configurable ignore paths for faster analysis
- 📝 **Detailed Reporting**: Shows exact file locations and dependency chains

## 📦 Installation

### Global Installation (Recommended)
```bash
npm install -g @webtoon-today/react-circular-dependency-analyzer
```

### Local Installation
```bash
npm install --save-dev @webtoon-today/react-circular-dependency-analyzer
```

## 🔧 Usage

### Command Line Interface

```bash
# Analyze current directory
react-analyzer

# Or use short alias
rca

# Analyze specific directory
react-analyzer -e ./src

# Launch interactive web interface
react-analyzer --web

# Launch on custom port
react-analyzer --web --port 8080

# Analyze with custom ignore paths
react-analyzer -e ./src --ignore "tests,stories,docs"
```

### Web Interface

The interactive web interface provides:
- 🎨 **Pan/Zoom Controls**: Mouse wheel zoom, left-click drag on empty space to pan
- 🖱️ **Node Interaction**: Left-click drag nodes to reposition them
- 📊 **Real-time Progress**: See analysis progress file-by-file
- 🎯 **Interactive Tooltips**: Hover for detailed component information
- 🔄 **Live Updates**: Dynamic graph updates during analysis
- 📈 **Statistics Dashboard**: Component, state, and cycle counts

```bash
# Start web server
npm run web

# Development mode with auto-restart
npm run web:dev
```

### API Usage

```javascript
const { ReactParser } = require('@webtoon-today/react-circular-dependency-analyzer');

const parser = new ReactParser();
const graph = parser.analyzeProject('./src', ['node_modules', 'dist']);
const cycles = graph.findCircularDependencies();

console.log(`Found ${cycles.length} circular dependencies`);
```

## 🎯 What It Detects

### Supported React Patterns
- ✅ **useState** with proper state variable tracking
- ✅ **useEffect** dependency analysis
- ✅ **useCallback/useMemo** optimization detection
- ✅ **Recoil** atoms and selectors (`useRecoilState`, `useRecoilValue`)
- ✅ **Custom Hooks** with state extraction
- ✅ **Class Components** with setState
- ✅ **TypeScript** full support

### Common Circular Dependency Patterns

#### 1. Self-Referencing State Updates
```javascript
const [data, setData] = useState([]);

useEffect(() => {
  setData(prev => [...prev, newItem]); // Can cause cycles
}, [data]); // ⚠️ data dependency
```

#### 2. Cross-Component State Sharing
```javascript
// Component A updates state that Component B depends on,
// which updates state that Component A depends on
```

#### 3. Recoil Atom Cycles
```javascript
const userAtom = atom({ key: 'user', default: null });
const profileAtom = selector({
  key: 'profile',
  get: ({get}) => get(userAtom)?.profile,
  set: ({set, get}, newValue) => {
    set(userAtom, {...get(userAtom), profile: newValue}); // Potential cycle
  }
});
```

## 📊 Example Output

### CLI Output
```bash
🔍 Analyzing React project for circular state dependencies...

✅ Found 2 circular dependencies:

🔄 Cycle 1: UserProfile.userData → UserProfile → UserProfile.userData
   📁 File: ./src/components/UserProfile.tsx:25
   ⚠️  Risk: High (direct self-reference)

🔄 Cycle 2: ChatList.messages → MessageInput → ChatList.messages  
   📁 Files: ./src/ChatList.tsx:12 → ./src/MessageInput.tsx:8
   ⚠️  Risk: Medium (cross-component dependency)

📊 Analysis Summary:
   • 47 components analyzed
   • 156 state variables found
   • 234 dependencies tracked
   • 2 circular dependencies detected
```

### Web Interface
![Web Interface Screenshot](https://via.placeholder.com/800x400?text=Interactive+Graph+Visualization)

## ⚙️ Configuration

### Ignore Paths (Default)
The analyzer automatically ignores common directories:
- `node_modules`, `dist`, `build`, `.next`
- `ios`, `android` (React Native)
- `.git`, `coverage`, `docs`

### Custom Configuration
```javascript
// react-analyzer.config.js
module.exports = {
  entry: './src/App.tsx',
  ignorePaths: ['tests', '__mocks__', 'stories'],
  outputFormat: 'json', // 'json' | 'console' | 'html'
  includeTypeScript: true,
  recoilSupport: true
};
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Parser        │    │   Graph          │    │   Web UI        │
│                 │    │                  │    │                 │
│ • Babel AST     │───▶│ • Bipartite      │───▶│ • D3.js         │
│ • TypeScript    │    │ • Cycle Detection│    │ • Real-time     │
│ • Recoil        │    │ • State Tracking │    │ • Interactive   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup
```bash
git clone https://github.com/webtoon-today/react-circular-dependency-static-analyzer.git
cd react-circular-dependency-static-analyzer
npm install
npm run web:dev
```

## 📝 License

MIT © [Webtoon Today](https://github.com/webtoon-today)

## 🔗 Links

- [GitHub Repository](https://github.com/webtoon-today/react-circular-dependency-static-analyzer)
- [npm Package](https://www.npmjs.com/package/@webtoon-today/react-circular-dependency-analyzer)
- [Issue Tracker](https://github.com/webtoon-today/react-circular-dependency-static-analyzer/issues)

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=webtoon-today/react-circular-dependency-static-analyzer&type=Date)](https://star-history.com/#webtoon-today/react-circular-dependency-static-analyzer&Date)

---

Made with ❤️ by the Webtoon Today team