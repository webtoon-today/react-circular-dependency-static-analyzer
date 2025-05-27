const fs = require('fs');
const path = require('path');
const os = require('os');
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const t = require('@babel/types');
const BipartiteGraph = require('./graph');

class ReactParser {
  constructor() {
    this.graph = new BipartiteGraph();
  }

  analyzeProject(entryPoint, ignorePaths = []) {
    // Expand tilde to home directory
    const expandedPath = entryPoint.startsWith('~') 
      ? path.join(os.homedir(), entryPoint.slice(1))
      : entryPoint;
    
    const files = this.getAllReactFiles(expandedPath, ignorePaths);
    
    console.log(`Found ${files.length} React files to analyze`);
    
    for (const filePath of files) {
      this.analyzeFile(filePath);
    }

    return this.graph;
  }

  getReactFilesList(entryPoint, ignorePaths = []) {
    // Expand tilde to home directory
    const expandedPath = entryPoint.startsWith('~') 
      ? path.join(os.homedir(), entryPoint.slice(1))
      : entryPoint;
    
    return this.getAllReactFiles(expandedPath, ignorePaths);
  }

  getAllReactFiles(entryPoint, ignorePaths = []) {
    const files = [];
    const visited = new Set();
    
    // Add default ignore patterns
    const defaultIgnore = ['node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'ios', 'android'];
    const allIgnorePaths = [...defaultIgnore, ...ignorePaths];

    const shouldIgnore = (itemName, fullPath) => {
      return allIgnorePaths.some(ignorePath => {
        if (itemName === ignorePath) return true;
        if (fullPath.includes(`/${ignorePath}/`) || fullPath.includes(`\\${ignorePath}\\`)) return true;
        return false;
      });
    };

    const traverse = (dir) => {
      if (visited.has(dir)) return;
      visited.add(dir);

      try {
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
          const fullPath = path.join(dir, item);
          
          // Skip if should be ignored
          if (shouldIgnore(item, fullPath)) {
            continue;
          }
          
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory() && !item.startsWith('.')) {
            traverse(fullPath);
          } else if (stat.isFile() && this.isReactFile(fullPath)) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        console.warn(`Cannot read directory ${dir}: ${error.message}`);
      }
    };

    if (fs.statSync(entryPoint).isFile()) {
      files.push(entryPoint);
      traverse(path.dirname(entryPoint));
    } else {
      traverse(entryPoint);
    }

    return files;
  }

  isReactFile(filePath) {
    const ext = path.extname(filePath);
    return ['.js', '.jsx', '.ts', '.tsx'].includes(ext);
  }

  analyzeFile(filePath) {
    try {
      console.log(`🔍 Reading file: ${filePath}`);
      this.currentFilePath = filePath; // Store current file path for location tracking
      const code = fs.readFileSync(filePath, 'utf-8');
      console.log(`📝 File size: ${code.length} characters`);
      
      const ast = parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript', 'decorators-legacy']
      });
      console.log(`🌳 AST parsed successfully`);

      const componentInfo = this.extractComponentInfo(ast, filePath);
      
      if (componentInfo) {
        console.log(`✅ Found React component: ${componentInfo.name} (${componentInfo.type}) at line ${componentInfo.lineNumber}`);
        this.graph.addComponent(componentInfo.name, filePath, componentInfo.lineNumber);
        this.extractStateRelations(ast, componentInfo.name, filePath);
        this.extractPropsRelations(ast, componentInfo.name, filePath);
      } else {
        console.log(`❌ No React component found in ${path.basename(filePath)}`);
        // Let's check what we actually found
        this.debugFileContent(ast, filePath);
      }
    } catch (error) {
      console.error(`💥 Error parsing ${filePath}: ${error.message}`);
    }
  }

  debugFileContent(ast, filePath) {
    let hasJSX = false;
    let hasHooks = false;
    let hasFunctionDeclarations = false;
    let hasArrowFunctions = false;
    let hasClassDeclarations = false;
    let functionNames = [];
    let hookCalls = [];

    const self = this;
    traverse(ast, {
      JSXElement() {
        hasJSX = true;
      },
      FunctionDeclaration(path) {
        hasFunctionDeclarations = true;
        if (path.node.id) {
          functionNames.push(path.node.id.name);
        }
      },
      VariableDeclarator(path) {
        if (path.node.init && (t.isArrowFunctionExpression(path.node.init) || t.isFunctionExpression(path.node.init))) {
          hasArrowFunctions = true;
          if (path.node.id) {
            functionNames.push(path.node.id.name);
          }
        }
      },
      ClassDeclaration(path) {
        hasClassDeclarations = true;
        if (path.node.id) {
          functionNames.push(path.node.id.name);
        }
      },
      CallExpression(path) {
        if (t.isIdentifier(path.node.callee)) {
          const name = path.node.callee.name;
          if (name.startsWith('use') && name.length > 3) {
            hasHooks = true;
            hookCalls.push(name);
          }
        }
      }
    });

    console.log(`🔍 Debug ${path.basename(filePath)}:`);
    console.log(`   JSX: ${hasJSX}`);
    console.log(`   Hooks: ${hasHooks} ${hookCalls.length > 0 ? `(${hookCalls.join(', ')})` : ''}`);
    console.log(`   Functions: ${hasFunctionDeclarations} ${functionNames.length > 0 ? `(${functionNames.slice(0, 3).join(', ')})` : ''}`);
    console.log(`   Arrow Functions: ${hasArrowFunctions}`);
    console.log(`   Classes: ${hasClassDeclarations}`);
  }

  extractComponentInfo(ast, filePath) {
    let componentInfo = null;
    const self = this;

    traverse(ast, {
      FunctionDeclaration(path) {
        if (self.isReactComponent(path.node)) {
          componentInfo = {
            name: path.node.id.name,
            lineNumber: path.node.loc.start.line,
            type: 'function'
          };
        }
      },
      VariableDeclarator(path) {
        if (t.isArrowFunctionExpression(path.node.init) || t.isFunctionExpression(path.node.init)) {
          if (self.isReactComponent(path.node.init)) {
            componentInfo = {
              name: path.node.id.name,
              lineNumber: path.node.loc.start.line,
              type: 'arrow'
            };
          }
        }
      },
      ClassDeclaration(path) {
        if (self.isReactClassComponent(path.node)) {
          componentInfo = {
            name: path.node.id.name,
            lineNumber: path.node.loc.start.line,
            type: 'class'
          };
        }
      }
    });

    return componentInfo;
  }

  isReactComponent(node) {
    let hasJSX = false;
    let hasHooks = false;
    let jsxElements = [];
    let hookCalls = [];

    try {
      // Check if the function has a body to traverse
      if (!node.body) {
        console.log(`❌ Node has no body to traverse`);
        return false;
      }
      
      // Create a simple traversal function
      const checkNode = (currentNode) => {
        if (!currentNode) return;
        
        if (currentNode.type === 'JSXElement') {
          hasJSX = true;
          if (currentNode.openingElement && currentNode.openingElement.name) {
            jsxElements.push(currentNode.openingElement.name.name || 'unknown');
          }
        }
        
        if (currentNode.type === 'CallExpression' && 
            currentNode.callee && 
            currentNode.callee.type === 'Identifier') {
          const name = currentNode.callee.name;
          if (name.startsWith('use') && name.length > 3) {
            hasHooks = true;
            hookCalls.push(name);
          }
        }
        
        // Recursively check all properties
        for (const key in currentNode) {
          const value = currentNode[key];
          if (Array.isArray(value)) {
            value.forEach(checkNode);
          } else if (value && typeof value === 'object' && value.type) {
            checkNode(value);
          }
        }
      };
      
      checkNode(node.body);
      
      // A React component must have JSX. 
      // Functions with only hooks (no JSX) are custom hooks, not components
      const isComponent = hasJSX;
      console.log(`🔍 Component check: JSX=${hasJSX} ${jsxElements.length > 0 ? `(${jsxElements.slice(0, 3).join(', ')})` : ''}, Hooks=${hasHooks} ${hookCalls.length > 0 ? `(${hookCalls.join(', ')})` : ''} → ${isComponent ? 'COMPONENT' : hasHooks ? 'CUSTOM_HOOK' : 'NOT_COMPONENT'}`);
      
    } catch (error) {
      console.log(`❌ Error checking component: ${error.message}`);
      return false;
    }

    // Only consider it a React component if it returns JSX
    // Custom hooks (functions with hooks but no JSX) should not be treated as components
    return hasJSX;
  }

  isReactClassComponent(node) {
    if (!node.superClass) return false;
    
    if (t.isIdentifier(node.superClass, { name: 'Component' }) ||
        t.isIdentifier(node.superClass, { name: 'PureComponent' })) {
      return true;
    }

    if (t.isMemberExpression(node.superClass)) {
      return (t.isIdentifier(node.superClass.object, { name: 'React' }) &&
              (t.isIdentifier(node.superClass.property, { name: 'Component' }) ||
               t.isIdentifier(node.superClass.property, { name: 'PureComponent' })));
    }

    return false;
  }

  extractStateRelations(ast, componentName, filePath) {
    const self = this;
    let stateCount = 0;
    let effectCount = 0;
    let memoCount = 0;
    let setStateCount = 0;
    
    console.log(`🔍 Extracting state relations for component: ${componentName}`);
    
    traverse(ast, {
      CallExpression(path) {
        if (t.isIdentifier(path.node.callee, { name: 'useState' })) {
          stateCount++;
          console.log(`📦 Found useState in ${componentName}`);
          self.handleUseState(path, componentName);
        } else if (t.isIdentifier(path.node.callee, { name: 'useEffect' })) {
          effectCount++;
          console.log(`⚡ Found useEffect in ${componentName}`);
          self.handleUseEffect(path, componentName);
        } else if (t.isIdentifier(path.node.callee, { name: 'useCallback' }) ||
                   t.isIdentifier(path.node.callee, { name: 'useMemo' })) {
          memoCount++;
          console.log(`🧠 Found ${path.node.callee.name} in ${componentName}`);
          self.handleMemoizedHook(path, componentName);
        } else if (t.isIdentifier(path.node.callee, { name: 'useRecoilState' }) ||
                   t.isIdentifier(path.node.callee, { name: 'useRecoilValue' }) ||
                   t.isIdentifier(path.node.callee, { name: 'useSetRecoilState' })) {
          stateCount++;
          console.log(`🔮 Found Recoil hook: ${path.node.callee.name} in ${componentName}`);
          self.handleRecoilHook(path, componentName);
        } else if (t.isIdentifier(path.node.callee)) {
          const name = path.node.callee.name;
          if (name.startsWith('use') && name.length > 3 && 
              name !== 'useEffect' && 
              name !== 'useState' && 
              name !== 'useCallback' && 
              name !== 'useMemo' &&
              !name.startsWith('useRecoil')) {
            console.log(`🎣 Found custom hook: ${name} in ${componentName}`);
            self.handleCustomHook(path, componentName);
          }
        }
      },
      MemberExpression(path) {
        if (t.isThisExpression(path.node.object) && 
            t.isIdentifier(path.node.property, { name: 'setState' })) {
          setStateCount++;
          console.log(`🎛️ Found setState in ${componentName}`);
          self.handleSetState(path, componentName);
        }
      }
    });
    
    console.log(`📊 State summary for ${componentName}: ${stateCount} state variables, ${effectCount} useEffect, ${memoCount} memo hooks, ${setStateCount} setState`);
  }

  handleUseState(path, componentName) {
    const parent = path.parent;
    if (t.isVariableDeclarator(parent) && t.isArrayPattern(parent.id)) {
      const [stateVar, setterVar] = parent.id.elements;
      if (stateVar && setterVar) {
        const stateName = stateVar.name;
        const setterName = setterVar.name;
        const lineNumber = path.node.loc ? path.node.loc.start.line : null;
        
        console.log(`📦 useState: ${stateName} with setter ${setterName} in ${componentName} at line ${lineNumber}`);
        
        // Add the actual state variable as a state node with location
        this.graph.addState(stateName, componentName, 'useState', this.currentFilePath, lineNumber);
        
        // Create edge: Component uses State
        this.graph.addEdge(componentName, `${componentName}.${stateName}`, 'reads');
        
        this.findStateUpdates(path.getFunctionParent(), setterName, stateName, componentName);
      }
    }
  }

  handleUseEffect(path, componentName) {
    const [callback, dependencies] = path.node.arguments;
    
    console.log(`⚡ useEffect dependencies analysis in ${componentName}`);
    
    // Track what state variables this effect depends on
    if (dependencies && t.isArrayExpression(dependencies)) {
      for (const dep of dependencies.elements) {
        if (t.isIdentifier(dep)) {
          const depName = dep.name;
          console.log(`   🔗 Depends on: ${depName}`);
          
          // Create edge: State change triggers effect (which re-runs component)
          const stateKey = `${componentName}.${depName}`;
          this.graph.addEdge(stateKey, componentName, 'triggers-effect');
        }
      }
    }

    // Track what state gets updated inside this effect
    if (callback && (t.isArrowFunctionExpression(callback) || t.isFunctionExpression(callback))) {
      this.findStateUpdatesInCallback(callback, componentName);
    }
  }

  handleMemoizedHook(path, componentName) {
    const [callback, dependencies] = path.node.arguments;
    
    if (dependencies && t.isArrayExpression(dependencies)) {
      for (const dep of dependencies.elements) {
        if (t.isIdentifier(dep)) {
          // Only add edge if the dependency is a known state
          const stateKey = `${componentName}.${dep.name}`;
          if (this.graph.states.has(stateKey)) {
            this.graph.addEdge(stateKey, componentName, 'depends');
          }
        }
      }
    }
  }

  handleSetState(path, componentName) {
    const lineNumber = path.node.loc ? path.node.loc.start.line : null;
    this.graph.addState('state', componentName, 'setState', this.currentFilePath, lineNumber);
    this.graph.addEdge(componentName, `${componentName}.state`, 'updates');
  }

  findStateUpdates(scope, setterName, stateName, componentName) {
    const self = this;
    scope.traverse({
      CallExpression(path) {
        if (t.isIdentifier(path.node.callee, { name: setterName })) {
          console.log(`   📝 Found setter call: ${setterName} in ${componentName}`);
          
          // Component updates its own state
          self.graph.addEdge(componentName, `${componentName}.${stateName}`, 'updates');
          
          const arg = path.node.arguments[0];
          if (t.isArrowFunctionExpression(arg) || t.isFunctionExpression(arg)) {
            // State updater function - creates potential for cycles
            console.log(`   🔄 Setter uses updater function (potential cycle risk)`);
            self.graph.addEdge(`${componentName}.${stateName}`, `${componentName}.${stateName}`, 'self-update');
          }
        }
      }
    });
  }

  findStateUpdatesInCallback(callback, componentName) {
    const self = this;
    
    traverse(callback, {
      CallExpression(path) {
        if (t.isIdentifier(path.node.callee)) {
          const name = path.node.callee.name;
          if (name.startsWith('set') && name.length > 3) {
            // Try to extract the state name from setter name
            // setCount -> count, setUserData -> userData, etc.
            let stateName = name.slice(3);
            stateName = stateName.charAt(0).toLowerCase() + stateName.slice(1);
            
            console.log(`   📝 Effect calls setter: ${name} (updating ${stateName})`);
            
            const stateKey = `${componentName}.${stateName}`;
            
            // Create edge: Component updates State (through effect)
            self.graph.addEdge(componentName, stateKey, 'updates-via-effect');
            
            // Also add the state if it doesn't exist (might be from another component)
            if (!self.graph.states.has(stateKey)) {
              console.log(`   ➕ Adding inferred state: ${stateName}`);
              const lineNumber = path.node.loc ? path.node.loc.start.line : null;
              self.graph.addState(stateName, componentName, 'inferred', self.currentFilePath, lineNumber);
            }
          }
        }
      }
    });
  }

  handleRecoilHook(path, componentName) {
    console.log(`🔮 Processing Recoil hook in ${componentName}`);
    const hookName = path.node.callee.name;
    const args = path.node.arguments;
    const lineNumber = path.node.loc ? path.node.loc.start.line : null;
    
    if (args.length > 0) {
      // Try to get the atom name from the first argument
      let atomName = 'unknown';
      if (t.isIdentifier(args[0])) {
        atomName = args[0].name;
      } else if (t.isMemberExpression(args[0])) {
        atomName = 'member.' + (args[0].property.name || 'unknown');
      }
      
      console.log(`🔮 Recoil atom: ${atomName} accessed via ${hookName} at line ${lineNumber}`);
      
      // Add the atom as a state (shared across components) with location
      const stateKey = `global.${atomName}`;
      this.graph.addState(atomName, 'global', hookName, this.currentFilePath, lineNumber);
      
      // Create appropriate edges based on hook type
      if (hookName === 'useRecoilValue') {
        this.graph.addEdge(stateKey, componentName, 'recoil-reads');
      } else if (hookName === 'useSetRecoilState') {
        this.graph.addEdge(componentName, stateKey, 'recoil-writes');
      } else if (hookName === 'useRecoilState') {
        this.graph.addEdge(stateKey, componentName, 'recoil-reads');
        this.graph.addEdge(componentName, stateKey, 'recoil-writes');
      }
      
      console.log(`✅ Added Recoil state: ${atomName} for ${componentName}`);
    }
  }

  handleCustomHook(path, componentName) {
    const hookName = path.node.callee.name;
    const lineNumber = path.node.loc ? path.node.loc.start.line : null;
    console.log(`🎣 Processing custom hook: ${hookName} in ${componentName} at line ${lineNumber}`);
    
    // Find what this custom hook returns by looking at the variable assignment
    const parent = path.parent;
    if (t.isVariableDeclarator(parent)) {
      if (t.isArrayPattern(parent.id)) {
        // Hook returns array: const [data, setData] = useCustomHook()
        parent.id.elements.forEach((element, index) => {
          if (element && t.isIdentifier(element)) {
            const varName = element.name;
            // First element is usually state, setter functions are not state
            if (index === 0 || !varName.startsWith('set')) {
              console.log(`   📦 Custom hook returns state variable: ${varName}`);
              this.graph.addState(varName, componentName, 'custom-hook', this.currentFilePath, lineNumber);
              // Component reads this state
              this.graph.addEdge(`${componentName}.${varName}`, componentName, 'reads');
            }
          }
        });
      } else if (t.isObjectPattern(parent.id)) {
        // Hook returns object: const {data, loading, error} = useCustomHook()
        parent.id.properties.forEach(prop => {
          if (t.isObjectProperty(prop)) {
            let stateName;
            
            // Handle both { data } and { data: localData } patterns
            if (t.isIdentifier(prop.key)) {
              stateName = prop.key.name;
            }
            
            // Exclude common function names
            if (stateName && 
                !stateName.startsWith('set') && 
                !stateName.startsWith('on') && 
                !stateName.includes('Handler') &&
                !stateName.includes('Callback')) {
              console.log(`   📦 Custom hook returns state variable: ${stateName}`);
              this.graph.addState(stateName, componentName, 'custom-hook', this.currentFilePath, lineNumber);
              // Component reads this state
              this.graph.addEdge(`${componentName}.${stateName}`, componentName, 'reads');
            }
          }
        });
      } else if (t.isIdentifier(parent.id)) {
        // Simple assignment: const data = useCustomHook()
        const varName = parent.id.name;
        console.log(`   📦 Custom hook returns state variable: ${varName}`);
        this.graph.addState(varName, componentName, 'custom-hook', this.currentFilePath, lineNumber);
        // Component reads this state
        this.graph.addEdge(`${componentName}.${varName}`, componentName, 'reads');
      }
    } else {
      // Hook called without assignment - just log for debugging
      console.log(`   ⚠️ Custom hook ${hookName} called without variable assignment`);
    }
  }

  extractPropsRelations(ast, componentName, filePath) {
    const self = this;
    let jsxElementsFound = 0;
    let propsPassedCount = 0;
    
    console.log(`🔗 Extracting props relations for component: ${componentName}`);
    
    traverse(ast, {
      JSXElement(path) {
        jsxElementsFound++;
        const elementName = self.getJSXElementName(path.node);
        
        if (elementName && self.isPotentialComponent(elementName)) {
          console.log(`   📦 Found JSX element: ${elementName}`);
          
          // Analyze props passed to this element
          const props = self.analyzeJSXProps(path.node, componentName);
          propsPassedCount += props.length;
          
          props.forEach(prop => {
            if (prop.type === 'data') {
              console.log(`   📤 ${componentName} passes data "${prop.name}" to ${elementName}`);
              // Track data flow: Parent component -> Child component (via props)
              self.graph.addEdge(componentName, elementName, 'passes-props');
            } else if (prop.type === 'callback') {
              console.log(`   📞 ${componentName} passes callback "${prop.name}" to ${elementName}`);
              // Track callback flow: Child component -> Parent component (via callback)
              self.graph.addEdge(elementName, componentName, 'calls-callback');
            }
          });
        }
      }
    });
    
    console.log(`📊 Props summary for ${componentName}: ${jsxElementsFound} JSX elements, ${propsPassedCount} props passed`);
  }

  getJSXElementName(jsxElement) {
    if (jsxElement.openingElement && jsxElement.openingElement.name) {
      if (t.isJSXIdentifier(jsxElement.openingElement.name)) {
        return jsxElement.openingElement.name.name;
      } else if (t.isJSXMemberExpression(jsxElement.openingElement.name)) {
        // Handle cases like <Foo.Bar />
        return `${jsxElement.openingElement.name.object.name}.${jsxElement.openingElement.name.property.name}`;
      }
    }
    return null;
  }

  isPotentialComponent(elementName) {
    // Component names start with uppercase letter
    // Exclude native HTML elements
    const htmlElements = ['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
                         'button', 'input', 'form', 'img', 'a', 'ul', 'li', 'ol',
                         'table', 'tr', 'td', 'th', 'thead', 'tbody', 'section',
                         'header', 'footer', 'nav', 'main', 'article', 'aside'];
    
    // React Native elements
    const reactNativeElements = ['View', 'Text', 'ScrollView', 'TouchableOpacity', 
                                'TouchableHighlight', 'TouchableWithoutFeedback', 
                                'Image', 'TextInput', 'Button', 'Switch', 'Slider',
                                'ActivityIndicator', 'Modal', 'Alert', 'Dimensions',
                                'SafeAreaView', 'StatusBar', 'FlatList', 'SectionList'];
    
    if (htmlElements.includes(elementName.toLowerCase()) || 
        reactNativeElements.includes(elementName)) {
      return false;
    }
    
    // Must start with uppercase (React convention)
    return /^[A-Z]/.test(elementName);
  }

  analyzeJSXProps(jsxElement, parentComponent) {
    const props = [];
    
    if (jsxElement.openingElement && jsxElement.openingElement.attributes) {
      jsxElement.openingElement.attributes.forEach(attr => {
        if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
          const propName = attr.name.name;
          const propType = this.determinePropType(propName, attr.value);
          
          props.push({
            name: propName,
            type: propType
          });
        }
      });
    }
    
    return props;
  }

  determinePropType(propName, propValue) {
    // Callbacks typically start with 'on' or contain 'callback', 'handler'
    if (propName.startsWith('on') || 
        propName.includes('callback') || 
        propName.includes('handler') ||
        propName.includes('Handle')) {
      return 'callback';
    }
    
    // Check if the value is a function expression
    if (propValue && t.isJSXExpressionContainer(propValue)) {
      const expression = propValue.expression;
      if (t.isArrowFunctionExpression(expression) || 
          t.isFunctionExpression(expression)) {
        return 'callback';
      }
      
      // Check for function calls that might be callbacks
      if (t.isCallExpression(expression)) {
        return 'callback';
      }
    }
    
    return 'data';
  }
}

module.exports = ReactParser;