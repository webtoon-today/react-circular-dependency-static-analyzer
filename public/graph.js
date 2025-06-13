class GraphVisualizer {
    constructor() {
        this.svg = d3.select('#graph');
        this.width = 0;
        this.height = 0;
        this.nodes = [];
        this.links = [];
        this.cycles = [];
        this.simulation = null;
        this.zoom = null;
        this.transform = d3.zoomIdentity;
        this.cycleClickHandler = null;
        
        this.setupEventListeners();
        this.setupTooltip();
        this.setupZoom();
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    setupEventListeners() {
        document.getElementById('analyzeBtn').addEventListener('click', () => this.analyzeProject());
        document.getElementById('clearBtn').addEventListener('click', () => this.clear());
        document.getElementById('layoutType').addEventListener('change', (e) => this.updateLayout(e.target.value));
        
        // Zoom control buttons
        document.getElementById('zoomIn').addEventListener('click', () => this.zoomIn());
        document.getElementById('zoomOut').addEventListener('click', () => this.zoomOut());
        document.getElementById('zoomReset').addEventListener('click', () => this.zoomReset());

        // Modal controls
        document.getElementById('modalClose').addEventListener('click', () => this.hideModal());
        document.getElementById('cyclesModal').addEventListener('click', (e) => {
            if (e.target.id === 'cyclesModal') {
                this.hideModal();
            }
        });

        // Close modal with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideModal();
            }
        });
    }

    setupTooltip() {
        this.tooltip = d3.select('.tooltip');
    }

    setupZoom() {
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 10])
            .filter(event => {
                // Allow mouse wheel for zoom always
                if (event.type === 'wheel') return true;
                
                // For mouse events, only allow pan if not clicking on a node
                if (event.type === 'mousedown') {
                    const target = event.target;
                    // Check if clicking on a node (circle or text inside a node group)
                    const isNode = target.closest('.node') !== null;
                    return !isNode; // Only allow pan if NOT clicking on a node
                }
                
                return event.button === 0; // Left mouse button
            })
            .on('zoom', (event) => {
                this.transform = event.transform;
                // Only apply transform if the group element exists
                if (this.g) {
                    this.g.attr('transform', this.transform);
                }
            });

        this.svg.call(this.zoom);
    }

    zoomIn() {
        this.svg.transition().duration(300).call(
            this.zoom.scaleBy, 1.5
        );
    }

    zoomOut() {
        this.svg.transition().duration(300).call(
            this.zoom.scaleBy, 1 / 1.5
        );
    }

    zoomReset() {
        this.svg.transition().duration(500).call(
            this.zoom.transform,
            d3.zoomIdentity
        );
    }

    resize() {
        const container = document.getElementById('graph-container');
        this.width = container.clientWidth;
        this.height = container.clientHeight - 60 - 86;
        
        this.svg
            .attr('width', this.width)
            .attr('height', this.height);

        if (this.simulation) {
            this.simulation
                .force('center', d3.forceCenter(this.width / 2, this.height / 2));
        }
    }

    async analyzeProject() {
        const entryPath = document.getElementById('entryPath').value || process.cwd();
        const ignorePaths = document.getElementById('ignorePaths').value
            .split(',')
            .map(p => p.trim())
            .filter(p => p.length > 0);
        
        console.log('🚀 Starting analysis...');
        console.log('📂 Entry path:', entryPath);
        console.log('🚫 Ignore paths:', ignorePaths);
        
        const analyzeBtn = document.getElementById('analyzeBtn');
        const loading = document.getElementById('loading');

        analyzeBtn.disabled = true;
        loading.style.display = 'block';
        this.clear();

        try {
            // First, get the list of files to analyze
            console.log('📋 Step 1: Scanning for React files...');
            this.updateProgress(0, 0, 'Scanning files...');
            
            const startScan = Date.now();
            const fileListResponse = await fetch('/api/analyze-with-progress', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entryPath, ignorePaths })
            });
            console.log(`⏱️ File scanning took ${Date.now() - startScan}ms`);

            if (!fileListResponse.ok) {
                console.error('❌ File scanning failed:', fileListResponse.status, fileListResponse.statusText);
                throw new Error(`File scanning failed: ${fileListResponse.statusText}`);
            }

            const { sessionId, files, totalFiles } = await fileListResponse.json();
            console.log(`✅ Found ${totalFiles} React files to analyze`);
            console.log('📁 Sample files:', files.slice(0, 5));
            console.log('🔑 Session ID:', sessionId);
            
            if (totalFiles === 0) {
                console.warn('⚠️ No React files found in the specified directory');
                alert('No React files found in the specified directory.');
                return;
            }

            // Analyze files one by one with progress updates
            console.log('🔍 Step 2: Starting individual file analysis...');
            let processedFiles = 0;
            const startAnalysis = Date.now();

            for (const filePath of files) {
                processedFiles++;
                const fileName = filePath.split('/').pop() || filePath.split('\\').pop();
                
                console.log(`📄 [${processedFiles}/${totalFiles}] Analyzing: ${fileName}`);
                this.updateProgress(processedFiles, totalFiles, `Analyzing: ${fileName}`, filePath);

                try {
                    const fileStartTime = Date.now();
                    const response = await fetch('/api/analyze-file', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filePath, sessionId })
                    });

                    const fileTime = Date.now() - fileStartTime;
                    
                    if (response.ok) {
                        const result = await response.json();
                        console.log(`✅ ${fileName} analyzed in ${fileTime}ms - Components: ${result.componentsCount}, States: ${result.statesCount}`);
                    } else {
                        console.warn(`⚠️ ${fileName} analysis failed:`, response.status, response.statusText);
                    }
                } catch (fileError) {
                    console.error(`❌ Failed to analyze ${fileName}:`, fileError.message);
                }
                
                // Small delay to allow UI updates
                await new Promise(resolve => setTimeout(resolve, 10));
                
                // Log progress every 10 files
                if (processedFiles % 10 === 0) {
                    const elapsed = Date.now() - startAnalysis;
                    const avgTimePerFile = elapsed / processedFiles;
                    const remainingFiles = totalFiles - processedFiles;
                    const estimatedTimeLeft = (remainingFiles * avgTimePerFile / 1000).toFixed(1);
                    console.log(`📊 Progress: ${processedFiles}/${totalFiles} (${(processedFiles/totalFiles*100).toFixed(1)}%) - ETA: ${estimatedTimeLeft}s`);
                }
            }
            
            console.log(`⏱️ Total file analysis took ${Date.now() - startAnalysis}ms`);

            // Get final results from server
            console.log('🔄 Step 3: Getting final results and finding circular dependencies...');
            this.updateProgress(totalFiles, totalFiles, 'Finding circular dependencies...');
            
            const resultsStartTime = Date.now();
            const resultsResponse = await fetch('/api/get-results', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId })
            });

            if (!resultsResponse.ok) {
                throw new Error(`Results generation failed: ${resultsResponse.statusText}`);
            }

            const graph = await resultsResponse.json();
            console.log(`⏱️ Results generation took ${Date.now() - resultsStartTime}ms`);

            console.log('📊 Final Results:');
            console.log(`   • Components: ${graph.components.length}`);
            console.log(`   • States: ${graph.states.length}`);
            console.log(`   • Edges: ${graph.edges.length}`);
            console.log(`   • Cycles: ${graph.cycles.length}`);

            console.log('🎨 Step 4: Rendering graph...');
            this.renderGraph(graph);
            this.updateStats(graph);
            console.log('✅ Analysis complete!');

        } catch (error) {
            console.error('💥 Analysis error:', error);
            console.error('Stack trace:', error.stack);
            alert(`Analysis failed: ${error.message}`);
        } finally {
            console.log('🏁 Cleaning up...');
            analyzeBtn.disabled = false;
            loading.style.display = 'none';
        }
    }

    updateProgress(current, total, message, filePath = '') {
        console.log(`📈 Progress update: ${message} ${total > 0 ? `(${current}/${total})` : ''}`);
        
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const currentFile = document.getElementById('currentFile');

        if (!progressFill || !progressText || !currentFile) {
            console.error('❌ Progress elements not found in DOM');
            return;
        }

        if (total > 0) {
            const percentage = (current / total) * 100;
            progressFill.style.width = `${percentage}%`;
            progressText.textContent = `${message} (${current}/${total})`;
            console.log(`📊 Progress bar: ${percentage.toFixed(1)}%`);
        } else {
            progressText.textContent = message;
        }

        if (filePath) {
            currentFile.textContent = filePath;
        }
    }

    findCycles(components, states, edges) {
        // Simple cycle detection - this could be moved to server side for better performance
        const visited = new Set();
        const recursionStack = new Set();
        const cycles = [];

        const allNodes = new Set([
            ...components.map(([name]) => name),
            ...states.map(([name]) => name)
        ]);

        const dfs = (node, path) => {
            if (recursionStack.has(node)) {
                const cycleStart = path.indexOf(node);
                if (cycleStart !== -1) {
                    cycles.push(path.slice(cycleStart).concat([node]));
                }
                return;
            }

            if (visited.has(node)) return;

            visited.add(node);
            recursionStack.add(node);
            path.push(node);

            const outgoingEdges = edges.filter(edge => edge.from === node);
            for (const edge of outgoingEdges) {
                dfs(edge.to, [...path]);
            }

            recursionStack.delete(node);
            path.pop();
        };

        for (const node of allNodes) {
            if (!visited.has(node)) {
                dfs(node, []);
            }
        }

        return cycles;
    }

    renderGraph(data) {
        this.processData(data);
        
        const layoutType = document.getElementById('layoutType').value;
        this.updateLayout(layoutType);
    }

    processData(data) {
        this.nodes = [];
        this.links = [];
        this.cycles = data.cycles || [];

        const cycleNodes = new Set();
        this.cycles.forEach(cycle => {
            cycle.forEach(node => cycleNodes.add(node));
        });

        data.components.forEach(([name, info]) => {
            this.nodes.push({
                id: name,
                type: 'component',
                label: name,
                filePath: info.filePath,
                lineNumber: info.lineNumber,
                inCycle: cycleNodes.has(name)
            });
        });

        data.states.forEach(([name, info]) => {
            this.nodes.push({
                id: name,
                type: 'state',
                label: name.split('.').pop(),
                componentName: info.componentName,
                stateType: info.stateType,
                inCycle: cycleNodes.has(name)
            });
        });

        data.edges.forEach(edge => {
            this.links.push({
                source: edge.from,
                target: edge.to,
                edgeType: edge.edgeType,
                inCycle: this.isEdgeInCycle(edge)
            });
        });
    }

    isEdgeInCycle(edge) {
        return this.cycles.some(cycle => {
            for (let i = 0; i < cycle.length - 1; i++) {
                if (cycle[i] === edge.from && cycle[i + 1] === edge.target) {
                    return true;
                }
            }
            return false;
        });
    }

    updateLayout(layoutType) {
        console.log(`🎨 Updating layout: ${layoutType}`);
        this.svg.selectAll('*').remove();
        
        // Create main group for zoom/pan transforms
        this.g = this.svg.append('g');
        console.log('📦 Created main group element for zoom/pan');

        switch (layoutType) {
            case 'bipartite':
                this.renderBipartiteLayout();
                break;
            case 'hierarchical':
                this.renderHierarchicalLayout();
                break;
            default:
                this.renderForceLayout();
        }
    }

    renderForceLayout() {
        this.simulation = d3.forceSimulation(this.nodes)
            .force('link', d3.forceLink(this.links).id(d => d.id).distance(100))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(this.width / 2, this.height / 2))
            .force('collision', d3.forceCollide().radius(30));

        this.renderElements();
        this.simulation.on('tick', () => this.ticked());
    }

    renderBipartiteLayout() {
        const components = this.nodes.filter(d => d.type === 'component');
        const states = this.nodes.filter(d => d.type === 'state');
        
        const leftX = this.width * 0.25;
        const rightX = this.width * 0.75;
        
        components.forEach((d, i) => {
            d.fx = leftX;
            d.fy = (i + 1) * this.height / (components.length + 1);
        });
        
        states.forEach((d, i) => {
            d.fx = rightX;
            d.fy = (i + 1) * this.height / (states.length + 1);
        });

        this.simulation = d3.forceSimulation(this.nodes)
            .force('link', d3.forceLink(this.links).id(d => d.id).distance(50))
            .force('charge', d3.forceManyBody().strength(-100));

        this.renderElements();
        this.simulation.on('tick', () => this.ticked());
    }

    renderHierarchicalLayout() {
        const hierarchy = this.createHierarchy();
        const treeLayout = d3.tree().size([this.width - 100, this.height - 100]);
        const root = treeLayout(hierarchy);

        root.descendants().forEach(d => {
            if (d.data.node) {
                d.data.node.fx = d.x + 50;
                d.data.node.fy = d.y + 50;
            }
        });

        this.simulation = d3.forceSimulation(this.nodes)
            .force('link', d3.forceLink(this.links).id(d => d.id).distance(30));

        this.renderElements();
        this.simulation.on('tick', () => this.ticked());
    }

    createHierarchy() {
        const root = { name: 'Root', children: [] };
        const components = this.nodes.filter(d => d.type === 'component');
        
        components.forEach(comp => {
            const states = this.nodes.filter(d => 
                d.type === 'state' && d.componentName === comp.label
            );
            
            root.children.push({
                name: comp.label,
                node: comp,
                children: states.map(s => ({ name: s.label, node: s }))
            });
        });

        return d3.hierarchy(root);
    }

    renderElements() {
        // Add arrow marker definition to SVG defs
        this.svg.append('defs').append('marker')
            .attr('id', 'arrowhead')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 20)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', '#999');

        const link = this.g.append('g')
            .selectAll('line')
            .data(this.links)
            .enter().append('line')
            .attr('class', d => `link ${d.inCycle ? 'cycle' : ''}`)
            .attr('stroke', d => d.inCycle ? '#dc3545' : '#999')
            .attr('stroke-width', d => d.inCycle ? 3 : 2)
            .attr('stroke-dasharray', d => d.inCycle ? '5,5' : 'none')
            .attr('marker-end', 'url(#arrowhead)');

        const node = this.g.append('g')
            .selectAll('g')
            .data(this.nodes)
            .enter().append('g')
            .attr('class', 'node')
            .call(d3.drag()
                .filter(event => event.button === 0) // Only left mouse button
                .on('start', (event, d) => this.dragStarted(event, d))
                .on('drag', (event, d) => this.dragged(event, d))
                .on('end', (event, d) => this.dragEnded(event, d)));

        node.append('circle')
            .attr('r', d => d.type === 'component' ? 20 : 15)
            .attr('fill', d => {
                if (d.inCycle) return '#dc3545';
                return d.type === 'component' ? '#667eea' : '#28a745';
            })
            .attr('stroke', '#fff')
            .attr('stroke-width', 2);

        node.append('text')
            .attr('dy', '.35em')
            .attr('text-anchor', 'middle')
            .attr('fill', 'white')
            .attr('font-size', '10px')
            .attr('font-weight', 'bold')
            .text(d => d.label.length > 8 ? d.label.substring(0, 8) + '...' : d.label);

        node.on('mouseover', (event, d) => this.showTooltip(event, d))
            .on('mouseout', () => this.hideTooltip());

        this.linkElements = link;
        this.nodeElements = node;
    }

    ticked() {
        if (this.linkElements) {
            this.linkElements
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);
        }

        if (this.nodeElements) {
            this.nodeElements
                .attr('transform', d => `translate(${d.x},${d.y})`);
        }
    }

    dragStarted(event, d) {
        // Prevent zoom/pan during node drag
        event.stopPropagation();
        
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    dragged(event, d) {
        // Prevent zoom/pan during node drag
        event.stopPropagation();
        
        d.fx = event.x;
        d.fy = event.y;
    }

    dragEnded(event, d) {
        // Prevent zoom/pan during node drag
        event.stopPropagation();
        
        if (!event.active) this.simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    showTooltip(event, d) {
        let content = `<strong>${d.label}</strong><br>Type: ${d.type}`;
        
        if (d.type === 'component') {
            content += `<br>File: ${d.filePath}<br>Line: ${d.lineNumber}`;
        } else {
            content += `<br>Component: ${d.componentName}<br>State Type: ${d.stateType}`;
        }
        
        if (d.inCycle) {
            content += '<br><span style="color: #dc3545;">⚠️ In Circular Dependency</span>';
        }

        this.tooltip
            .style('display', 'block')
            .html(content)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px');
    }

    hideTooltip() {
        this.tooltip.style('display', 'none');
    }

    updateStats(data) {
        document.getElementById('componentsCount').textContent = data.components.length;
        document.getElementById('statesCount').textContent = data.states.length;
        document.getElementById('edgesCount').textContent = data.edges.length;
        document.getElementById('cyclesCount').textContent = data.cycles.length;
        
        document.getElementById('stats').style.display = 'grid';
        
        // Store cycles and node info for modal display
        this.cycles = data.cycles;
        this.nodeInfo = this.buildNodeInfoMap(data);
        
        // Make cycle count clickable if there are cycles
        const cycleStatItem = document.getElementById('cyclesCount').parentElement;
        console.log('📊 Cycles found:', data.cycles.length, 'Stat item:', cycleStatItem);
        
        if (data.cycles.length > 0) {
            cycleStatItem.classList.add('cycle-count-clickable');
            
            // Remove existing click listeners by storing reference
            if (this.cycleClickHandler) {
                cycleStatItem.removeEventListener('click', this.cycleClickHandler);
            }
            
            // Create and store new click handler
            this.cycleClickHandler = () => {
                console.log('🖱️ Cycle count clicked!');
                this.showModal();
            };
            cycleStatItem.addEventListener('click', this.cycleClickHandler);
            console.log('✅ Click handler added to cycle count');
            
        } else {
            cycleStatItem.classList.remove('cycle-count-clickable');
            if (this.cycleClickHandler) {
                cycleStatItem.removeEventListener('click', this.cycleClickHandler);
                this.cycleClickHandler = null;
            }
        }
    }

    buildNodeInfoMap(data) {
        const nodeInfo = new Map();
        
        // Add component info
        data.components.forEach(([name, info]) => {
            nodeInfo.set(name, info);
        });
        
        // Add state info
        data.states.forEach(([name, info]) => {
            nodeInfo.set(name, info);
        });
        
        return nodeInfo;
    }


    clear() {
        console.log('🧹 Clearing graph...');
        this.svg.selectAll('*').remove();
        document.getElementById('stats').style.display = 'none';
        this.hideModal(); // Close modal if open
        this.nodes = [];
        this.links = [];
        this.cycles = [];
        this.nodeInfo = null;

        // Remove cycle count clickable styling and event handler
        const cycleStatItem = document.getElementById('cyclesCount').parentElement;
        cycleStatItem.classList.remove('cycle-count-clickable');
        if (this.cycleClickHandler) {
            cycleStatItem.removeEventListener('click', this.cycleClickHandler);
            this.cycleClickHandler = null;
        }
        
        // Reset zoom safely
        this.transform = d3.zoomIdentity;
        this.g = null; // Clear the group reference
        
        if (this.zoom) {
            try {
                this.svg.call(this.zoom.transform, d3.zoomIdentity);
            } catch (error) {
                console.warn('⚠️ Failed to reset zoom:', error.message);
            }
        }
        
        if (this.simulation) {
            this.simulation.stop();
            this.simulation = null;
        }
        
        console.log('✅ Graph cleared successfully');
    }

    showModal() {
        console.log('🔄 showModal called, cycles:', this.cycles);
        
        if (!this.cycles || this.cycles.length === 0) {
            console.log('❌ No cycles to display');
            return;
        }

        // Populate modal with cycles
        const modalContent = document.getElementById('modalCyclesContent');
        if (!modalContent) {
            console.error('❌ Modal content element not found');
            return;
        }
        
        modalContent.innerHTML = '';

        this.cycles.forEach((cycle, index) => {
            const cycleDiv = document.createElement('div');
            cycleDiv.className = 'modal-cycle-item';
            
            // Build enhanced cycle text with location info
            const enhancedCycle = cycle.map(node => {
                // Try to get node info from the last known data
                const nodeInfo = this.getNodeDisplayInfo(node);
                return nodeInfo;
            });
            
            const cycleText = enhancedCycle.join(' → ') + ' → (cycles back)';
            cycleDiv.innerHTML = `
                <div class="cycle-title">Cycle ${index + 1}</div>
                <div class="cycle-path">${cycleText}</div>
            `;
            
            modalContent.appendChild(cycleDiv);
        });

        // Show modal
        const modal = document.getElementById('cyclesModal');
        if (modal) {
            console.log('✅ Showing modal');
            modal.style.display = 'block';
        } else {
            console.error('❌ Modal element not found');
        }
    }

    hideModal() {
        console.log('🚫 hideModal called');
        const modal = document.getElementById('cyclesModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    getNodeDisplayInfo(node) {
        if (!this.nodeInfo) {
            // Fallback if no node info available
            return node;
        }
        
        const info = this.nodeInfo.get(node);
        if (!info) {
            return node;
        }
        
        if (info.type === 'component') {
            const location = info.filePath && info.lineNumber ? ` (${this.getFileName(info.filePath)}:${info.lineNumber})` : '';
            return `<strong>${node}</strong>${location}`;
        } else if (info.type === 'state') {
            const location = info.filePath && info.lineNumber ? ` (${this.getFileName(info.filePath)}:${info.lineNumber})` : '';
            return `<em>${node}</em> <small>(${info.stateType}${location})</small>`;
        }
        
        return node;
    }

    getFileName(filePath) {
        // Extract just the filename from the full path
        if (!filePath) return '';
        const parts = filePath.split('/');
        return parts[parts.length - 1];
    }
}

const visualizer = new GraphVisualizer();