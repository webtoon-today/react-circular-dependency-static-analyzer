const express = require('express');
const cors = require('cors');
const path = require('path');
const ReactParser = require('./parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.post('/api/analyze', async (req, res) => {
    try {
        const { entryPath, ignorePaths } = req.body;
        
        if (!entryPath) {
            return res.status(400).json({ error: 'Entry path is required' });
        }

        console.log(`Analyzing project at: ${entryPath}`);
        if (ignorePaths && ignorePaths.length > 0) {
            console.log(`Ignoring paths: ${ignorePaths.join(', ')}`);
        }
        
        const parser = new ReactParser();
        const graph = parser.analyzeProject(entryPath, ignorePaths || []);
        
        const cycles = graph.findCircularDependencies();
        
        const responseData = {
            components: Array.from(graph.components.entries()),
            states: Array.from(graph.states.entries()),
            edges: graph.edges,
            cycles: cycles
        };
        
        console.log(`Analysis complete: ${responseData.components.length} components, ${responseData.states.length} states, ${cycles.length} cycles`);
        
        res.json(responseData);
        
    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({ 
            error: 'Analysis failed', 
            details: error.message 
        });
    }
});

// New endpoint for getting file list and starting analysis
app.post('/api/analyze-with-progress', async (req, res) => {
    try {
        const { entryPath, ignorePaths } = req.body;
        
        if (!entryPath) {
            console.error('❌ No entry path provided');
            return res.status(400).json({ error: 'Entry path is required' });
        }

        console.log(`📋 Getting file list for: ${entryPath}`);
        console.log(`🚫 Ignoring paths: ${(ignorePaths || []).join(', ')}`);
        
        const startTime = Date.now();
        const parser = new ReactParser();
        const files = parser.getReactFilesList(entryPath, ignorePaths || []);
        const scanTime = Date.now() - startTime;
        
        console.log(`✅ Found ${files.length} React files in ${scanTime}ms`);
        if (files.length > 0) {
            console.log(`📁 Sample files: ${files.slice(0, 3).map(f => f.split('/').pop()).join(', ')}${files.length > 3 ? '...' : ''}`);
        }
        
        res.json({ 
            files: files,
            totalFiles: files.length
        });
        
    } catch (error) {
        console.error('💥 File scanning error:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).json({ 
            error: 'File scanning failed', 
            details: error.message 
        });
    }
});

// Endpoint for analyzing a single file
app.post('/api/analyze-file', async (req, res) => {
    try {
        const { filePath, parser: parserState } = req.body;
        
        if (!filePath) {
            console.error('❌ No file path provided for analysis');
            return res.status(400).json({ error: 'File path is required' });
        }

        const fileName = filePath.split('/').pop() || filePath.split('\\').pop();
        console.log(`📄 Analyzing file: ${fileName}`);
        
        const startTime = Date.now();
        const parser = new ReactParser();
        
        // Restore parser state if provided
        if (parserState) {
            console.log(`🔄 Restoring parser state: ${parserState.components.length} components, ${parserState.states.length} states, ${parserState.edges.length} edges`);
            parser.graph.components = new Map(parserState.components);
            parser.graph.states = new Map(parserState.states);
            parser.graph.edges = parserState.edges;
        }
        
        parser.analyzeFile(filePath);
        const analysisTime = Date.now() - startTime;
        
        const responseData = {
            components: Array.from(parser.graph.components.entries()),
            states: Array.from(parser.graph.states.entries()),
            edges: parser.graph.edges
        };
        
        console.log(`✅ ${fileName} analyzed in ${analysisTime}ms - Total: ${responseData.components.length} components, ${responseData.states.length} states, ${responseData.edges.length} edges`);
        
        res.json(responseData);
        
    } catch (error) {
        console.error('💥 File analysis error:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).json({ 
            error: 'File analysis failed', 
            details: error.message 
        });
    }
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`🚀 React Circular Dependency Analyzer Web Server running on http://localhost:${PORT}`);
    console.log(`📊 Open your browser to view the interactive dependency graph`);
});