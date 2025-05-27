// Simple test script to verify modal functionality
const ReactParser = require('./src/parser');

// Create test data with cycles
const testData = {
    components: [
        { name: 'ComponentA', filePath: '/test/A.tsx', lineNumber: 1 },
        { name: 'ComponentB', filePath: '/test/B.tsx', lineNumber: 1 }
    ],
    states: [
        { name: 'stateA', component: 'ComponentA', type: 'useState' },
        { name: 'stateB', component: 'ComponentB', type: 'useState' }
    ],
    edges: [
        { from: 'ComponentA', to: 'ComponentB.stateB', type: 'updates' },
        { from: 'ComponentB', to: 'ComponentA.stateA', type: 'updates' }
    ],
    cycles: [
        ['ComponentA', 'ComponentB.stateB', 'ComponentB', 'ComponentA.stateA'],
        ['ComponentB', 'ComponentA.stateA', 'ComponentA', 'ComponentB.stateB']
    ]
};

console.log('Test data created with', testData.cycles.length, 'cycles');
console.log('Cycles:', testData.cycles);