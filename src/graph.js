class BipartiteGraph {
  constructor() {
    this.components = new Map();
    this.states = new Map();
    this.edges = [];
  }

  addComponent(name, filePath, lineNumber) {
    this.components.set(name, { filePath, lineNumber, type: 'component' });
  }

  addState(name, componentName, stateType, filePath = null, lineNumber = null) {
    const stateKey = `${componentName}.${name}`;
    this.states.set(stateKey, { 
      name, 
      componentName, 
      stateType, 
      type: 'state',
      filePath,
      lineNumber
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
          const cycle = path.slice(cycleStart).concat([node]);
          cycles.push(cycle);
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

    // Filter out false positive cycles
    return this.filterFalsePositiveCycles(cycles);
  }

  filterFalsePositiveCycles(cycles) {
    return cycles.filter(cycle => {
      // Remove duplicate consecutive nodes (artifact of DFS)
      const cleanCycle = cycle.filter((node, index) => 
        index === 0 || node !== cycle[index - 1]
      );

      // Filter out false positive patterns
      if (this.isSelfStateReadCycle(cleanCycle)) {
        console.log(`🚫 Filtered self-state-read cycle: ${cleanCycle.join(' → ')}`);
        return false;
      }

      if (this.isNormalRecoilPattern(cleanCycle)) {
        console.log(`🚫 Filtered normal Recoil pattern: ${cleanCycle.join(' → ')}`);
        return false;
      }

      if (this.isSelfUpdatePattern(cleanCycle)) {
        console.log(`🚫 Filtered self-update pattern: ${cleanCycle.join(' → ')}`);
        return false;
      }

      if (this.isSimplePropsPattern(cleanCycle)) {
        console.log(`🚫 Filtered simple props pattern: ${cleanCycle.join(' → ')}`);
        return false;
      }

      if (cleanCycle.length < 3) {
        console.log(`🚫 Filtered trivial cycle: ${cleanCycle.join(' → ')}`);
        return false;
      }

      console.log(`✅ Valid cycle detected: ${cleanCycle.join(' → ')}`);
      return true;
    });
  }

  isSelfStateReadCycle(cycle) {
    // Pattern: Component → Component.state → Component
    if (cycle.length === 3) {
      const [comp1, state, comp2] = cycle;
      return comp1 === comp2 && state.startsWith(`${comp1}.`);
    }
    return false;
  }

  isNormalRecoilPattern(cycle) {
    // Pattern: Component ↔ global.state (bidirectional)
    if (cycle.length === 3) {
      const [node1, node2, node3] = cycle;
      return (node1 === node3) && 
             (node2.startsWith('global.') || node1.startsWith('global.'));
    }
    return false;
  }

  isSelfUpdatePattern(cycle) {
    // Pattern: Component.state → Component.state
    if (cycle.length === 2) {
      const [state1, state2] = cycle;
      return state1 === state2 && state1.includes('.');
    }
    return false;
  }

  isSimplePropsPattern(cycle) {
    // Pattern: Parent → Child → Parent (simple bidirectional props)
    if (cycle.length === 3) {
      const [comp1, comp2, comp3] = cycle;
      
      // Simple parent-child relationship
      if (comp1 === comp3 && comp1 !== comp2) {
        // Check if the edges are props-related
        const edge1 = this.edges.find(e => e.from === comp1 && e.to === comp2);
        const edge2 = this.edges.find(e => e.from === comp2 && e.to === comp3);
        
        if (edge1 && edge2) {
          const hasPropsEdge = edge1.edgeType === 'passes-props' || edge2.edgeType === 'calls-callback';
          // Allow props patterns, but flag complex ones
          return hasPropsEdge && !this.hasStateInvolved(cycle);
        }
      }
    }
    return false;
  }

  hasStateInvolved(cycle) {
    // Check if any node in the cycle represents state
    return cycle.some(node => node.includes('.') && !node.startsWith('global.'));
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
      const location = info.filePath && info.lineNumber ? ` at ${info.filePath}:${info.lineNumber}` : '';
      console.log(`  ${name} (${info.stateType} in ${info.componentName}${location})`);
    }

    console.log('\nEdges:');
    for (const edge of this.edges) {
      console.log(`  ${edge.from} --${edge.edgeType}--> ${edge.to}`);
    }
  }
}

module.exports = BipartiteGraph;