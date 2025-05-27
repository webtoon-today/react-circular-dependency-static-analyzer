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
      
      const isComponent = hasJSX || hasHooks;
      console.log(`🔍 Component check: JSX=${hasJSX} ${jsxElements.length > 0 ? `(${jsxElements.slice(0, 3).join(', ')})` : ''}, Hooks=${hasHooks} ${hookCalls.length > 0 ? `(${hookCalls.join(', ')})` : ''} → ${isComponent ? 'COMPONENT' : 'NOT_COMPONENT'}`);
      
    } catch (error) {
      console.log(`❌ Error checking component: ${error.message}`);
      return false;
    }

    return hasJSX || hasHooks;
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
          if (name.startsWith('use') && name.length > 3 && name !== 'useEffect' && name !== 'useState') {
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
    
    console.log(`📊 State summary for ${componentName}: ${stateCount} useState, ${effectCount} useEffect, ${memoCount} memo hooks, ${setStateCount} setState`);
  }

  handleUseState(path, componentName) {
    const parent = path.parent;
    if (t.isVariableDeclarator(parent) && t.isArrayPattern(parent.id)) {
      const [stateVar, setterVar] = parent.id.elements;
      if (stateVar && setterVar) {
        const stateName = stateVar.name;
        const setterName = setterVar.name;
        
        console.log(`📦 useState: ${stateName} with setter ${setterName} in ${componentName}`);
        
        // Add the actual state variable as a state node
        this.graph.addState(stateName, componentName, 'useState');
        
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
    this.graph.addState('state', componentName, 'setState');
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
              self.graph.addState(stateName, componentName, 'inferred');
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
    
    if (args.length > 0) {
      // Try to get the atom name from the first argument
      let atomName = 'unknown';
      if (t.isIdentifier(args[0])) {
        atomName = args[0].name;
      } else if (t.isMemberExpression(args[0])) {
        atomName = 'member.' + (args[0].property.name || 'unknown');
      }
      
      console.log(`🔮 Recoil atom: ${atomName} accessed via ${hookName}`);
      
      // Add the atom as a state (shared across components)
      const stateKey = `global.${atomName}`;
      this.graph.addState(atomName, 'global', hookName);
      
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
    console.log(`🎣 Processing custom hook: ${hookName} in ${componentName}`);
    
    // Check if this custom hook is being destructured (likely returning state)
    const parent = path.parent;
    if (t.isVariableDeclarator(parent)) {
      if (t.isArrayPattern(parent.id)) {
        // Hook returns array: const [data, setData] = useCustomHook()
        const [stateVar] = parent.id.elements;
        if (stateVar && t.isIdentifier(stateVar)) {
          const stateName = stateVar.name;
          console.log(`   📦 Custom hook returns state: ${stateName}`);
          this.graph.addState(stateName, componentName, 'custom-hook');
          this.graph.addEdge(`${componentName}.${stateName}`, componentName, 'custom-state-dependency');
        }
      } else if (t.isObjectPattern(parent.id)) {
        // Hook returns object: const {data, loading} = useCustomHook()
        parent.id.properties.forEach(prop => {
          if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
            const stateName = prop.key.name;
            console.log(`   📦 Custom hook returns state: ${stateName}`);
            this.graph.addState(stateName, componentName, 'custom-hook');
            this.graph.addEdge(`${componentName}.${stateName}`, componentName, 'custom-state-dependency');
          }
        });
      } else if (t.isIdentifier(parent.id)) {
        // Simple assignment: const data = useCustomHook()
        const stateName = parent.id.name;
        console.log(`   📦 Custom hook returns state: ${stateName}`);
        this.graph.addState(stateName, componentName, 'custom-hook');
        this.graph.addEdge(`${componentName}.${stateName}`, componentName, 'custom-state-dependency');
      }
    }
  }
}

module.exports = ReactParser;