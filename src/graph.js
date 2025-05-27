class BipartiteGraph {
  constructor() {
    this.components = new Map();
    this.states = new Map();
    this.edges = [];
  }

  addComponent(name, filePath, lineNumber) {
    this.components.set(name, { filePath, lineNumber, type: 'component' });
  }

  addState(name, componentName, stateType) {
    const stateKey = `${componentName}.${name}`;
    this.states.set(stateKey, { 
      name, 
      componentName, 
      stateType, 
      type: 'state' 
    });
  }

  addEdge(from, to, edgeType) {
    // Validate that both nodes exist before adding edge
    const fromExists = this.components.has(from) || this.states.has(from);
    const toExists = this.components.has(to) || this.states.has(to);
    
    if (!fromExists) {
      console.warn(`Warning: Source node not found: ${from}`);
      return;
    }
    
    if (!toExists) {
      console.warn(`Warning: Target node not found: ${to}`);
      return;
    }
    
    this.edges.push({ from, to, edgeType });
  }

  findCircularDependencies() {
    const visited = new Set();
    const recursionStack = new Set();
    const cycles = [];

    const dfs = (node, path) => {
      if (recursionStack.has(node)) {
        const cycleStart = path.indexOf(node);
        if (cycleStart !== -1) {
          cycles.push(path.slice(cycleStart).concat([node]));
        }
        return;
      }

      if (visited.has(node)) {
        return;
      }

      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const outgoingEdges = this.edges.filter(edge => edge.from === node);
      for (const edge of outgoingEdges) {
        dfs(edge.to, [...path]);
      }

      recursionStack.delete(node);
      path.pop();
    };

    const allNodes = new Set([
      ...this.components.keys(),
      ...this.states.keys()
    ]);

    for (const node of allNodes) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    return cycles;
  }

  getNodeInfo(nodeName) {
    if (this.components.has(nodeName)) {
      return this.components.get(nodeName);
    }
    if (this.states.has(nodeName)) {
      return this.states.get(nodeName);
    }
    return null;
  }

  printGraph() {
    console.log('Components:');
    for (const [name, info] of this.components) {
      console.log(`  ${name} (${info.filePath}:${info.lineNumber})`);
    }

    console.log('\nStates:');
    for (const [name, info] of this.states) {
      console.log(`  ${name} (${info.stateType} in ${info.componentName})`);
    }

    console.log('\nEdges:');
    for (const edge of this.edges) {
      console.log(`  ${edge.from} --${edge.edgeType}--> ${edge.to}`);
    }
  }
}

module.exports = BipartiteGraph;