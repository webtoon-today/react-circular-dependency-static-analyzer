const express = require('express');
const cors = require('cors');
const path = require('path');
const ReactParser = require('./parser');

// Store parser instances by session ID to avoid large payload transfers
const parserSessions = new Map();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase payload limit
app.use(express.urlencoded({ limit: '50mb', extended: true }));
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
        
        // Create session ID and store parser
        const sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        parserSessions.set(sessionId, parser);
        
        // Clean up old sessions (keep last 10)
        if (parserSessions.size > 10) {
            const oldestKey = parserSessions.keys().next().value;
            parserSessions.delete(oldestKey);
        }
        
        res.json({ 
            sessionId: sessionId,
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
        const { filePath, sessionId } = req.body;
        
        if (!filePath) {
            console.error('❌ No file path provided for analysis');
            return res.status(400).json({ error: 'File path is required' });
        }

        if (!sessionId) {
            console.error('❌ No session ID provided for analysis');
            return res.status(400).json({ error: 'Session ID is required' });
        }

        // Get parser from session
        const parser = parserSessions.get(sessionId);
        if (!parser) {
            console.error('❌ Parser session not found');
            return res.status(400).json({ error: 'Parser session not found or expired' });
        }

        const fileName = filePath.split('/').pop() || filePath.split('\\').pop();
        console.log(`📄 Analyzing file: ${fileName}`);
        
        const startTime = Date.now();
        parser.analyzeFile(filePath);
        const analysisTime = Date.now() - startTime;
        
        // Return lightweight response (just counts, not full data)
        const responseData = {
            componentsCount: parser.graph.components.size,
            statesCount: parser.graph.states.size,
            edgesCount: parser.graph.edges.length,
            status: 'success'
        };
        
        console.log(`✅ ${fileName} analyzed in ${analysisTime}ms - Total: ${responseData.componentsCount} components, ${responseData.statesCount} states, ${responseData.edgesCount} edges`);
        
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

// Endpoint to get final analysis results
app.post('/api/get-results', async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        if (!sessionId) {
            console.error('❌ No session ID provided for results');
            return res.status(400).json({ error: 'Session ID is required' });
        }

        // Get parser from session
        const parser = parserSessions.get(sessionId);
        if (!parser) {
            console.error('❌ Parser session not found for results');
            return res.status(400).json({ error: 'Parser session not found or expired' });
        }

        console.log('📊 Generating final results and detecting cycles...');
        
        const cycles = parser.graph.findCircularDependencies();
        
        const responseData = {
            components: Array.from(parser.graph.components.entries()),
            states: Array.from(parser.graph.states.entries()),
            edges: parser.graph.edges,
            cycles: cycles
        };
        
        console.log(`✅ Final results: ${responseData.components.length} components, ${responseData.states.length} states, ${responseData.edges.length} edges, ${cycles.length} cycles`);
        
        // Clean up session after getting results
        parserSessions.delete(sessionId);
        
        res.json(responseData);
        
    } catch (error) {
        console.error('💥 Results generation error:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).json({ 
            error: 'Results generation failed', 
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