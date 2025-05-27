# Contributing to React Circular Dependency Analyzer

Thank you for considering contributing to this project! 🎉

## 🚀 Getting Started

### Prerequisites
- Node.js >= 14.0.0
- npm or yarn

### Development Setup
```bash
git clone https://github.com/webtoon-today/react-circular-dependency-static-analyzer.git
cd react-circular-dependency-static-analyzer
npm install
```

### Running the Development Environment
```bash
# Start the web interface in development mode
npm run web:dev

# Run CLI tool
npm start

# Run tests
npm test
```

## 🛠️ Development Guidelines

### Code Style
- Use meaningful variable names
- Add comments for complex logic
- Follow existing code patterns
- Use TypeScript types where applicable

### Testing
- Add tests for new features
- Ensure all tests pass before submitting PR
- Test with different React patterns (hooks, classes, TypeScript)

### Commit Messages
Follow conventional commit format:
```
feat: add support for React 18 concurrent features
fix: resolve infinite loop in cycle detection
docs: update README with new examples
refactor: improve parser performance
```

## 📝 Areas for Contribution

### High Priority
- [ ] Add support for Zustand state management
- [ ] Implement Redux/RTK analysis
- [ ] Add Jest/Vitest test support
- [ ] Improve TypeScript type inference
- [ ] Add VS Code extension

### Medium Priority
- [ ] Export analysis results to JSON/CSV
- [ ] Add performance benchmarking
- [ ] Implement configuration file validation
- [ ] Add more graph layout algorithms
- [ ] Improve error messages

### Documentation
- [ ] Add more code examples
- [ ] Create video tutorials
- [ ] Write blog posts about circular dependencies
- [ ] Improve API documentation

## 🐛 Bug Reports

When reporting bugs, please include:
- Node.js and npm versions
- Operating system
- Sample code that reproduces the issue
- Expected vs actual behavior
- Console error messages

## 💡 Feature Requests

For feature requests, please:
- Describe the use case
- Explain why it would be useful
- Provide examples if possible
- Consider implementation complexity

## 📋 Pull Request Process

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Make** your changes
4. **Add** tests for new functionality
5. **Run** tests (`npm test`)
6. **Commit** your changes (`git commit -m 'feat: add amazing feature'`)
7. **Push** to the branch (`git push origin feature/amazing-feature`)
8. **Open** a Pull Request

### PR Checklist
- [ ] Tests pass locally
- [ ] Code follows project style guidelines
- [ ] Documentation updated if needed
- [ ] No breaking changes (or clearly documented)
- [ ] Commits are meaningful and well-structured

## 🏗️ Architecture Overview

```
src/
├── parser.js      # Babel AST parsing and analysis
├── graph.js       # Graph data structure and cycle detection
├── server.js      # Express web server
├── cli.js         # Command-line interface
└── index.js       # Main entry point

public/
├── index.html     # Web UI interface
└── graph.js       # D3.js visualization logic
```

## 🔧 Technical Details

### Adding New Hook Support
To add support for a new React hook:

1. Add detection in `parser.js`:
```javascript
else if (t.isIdentifier(path.node.callee, { name: 'useNewHook' })) {
  this.handleNewHook(path, componentName);
}
```

2. Implement handler:
```javascript
handleNewHook(path, componentName) {
  // Extract state variables and relationships
  // Add to graph using this.graph.addState() and this.graph.addEdge()
}
```

### Adding New State Management Libraries
1. Update `extractStateRelations` method
2. Add appropriate edge types in `graph.js`
3. Update web UI colors/legends if needed
4. Add tests and documentation

## 📞 Getting Help

- 💬 **Discussions**: Use GitHub Discussions for questions
- 🐛 **Issues**: Use GitHub Issues for bugs and features
- 📧 **Email**: Contact maintainers for security issues

## 🙏 Recognition

Contributors will be:
- Listed in the README
- Mentioned in release notes
- Given appropriate GitHub repository permissions

Thank you for making this project better! 🚀