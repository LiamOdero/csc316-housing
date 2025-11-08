// Canada Mortgage Affordability Heatmap
// Using D3.js v7

// Global variables
let timeseriesData;
let geoData;
let currentIncome = 75000;
let currentQuarterIndex = 51;  // Start at 2025 Q2
let isPlaying = false;
let animationInterval = null;
let svg, projection, path, g;

// Color scale for affordability (green = affordable, red = unaffordable)
const colorScale = d3.scaleThreshold()
    .domain([20, 30, 40, 50])  // Percentage thresholds
    .range(['#2d5016', '#5a9216', '#ffc107', '#ff6b35', '#c1121f']);

// Initialize the visualization
async function init() {
    try {
        // Load data
        timeseriesData = await d3.json('data/mortgage_timeseries.json');
        geoData = await d3.json('data/canada_provinces.json');
        
        // Setup SVG
        setupSVG();
        
        // Draw the map
        drawProvinces();
        drawCMAs();
        
        // Setup controls
        setupControls();
        setupTimelineControls();
        
        // Update displays
        updateAllDisplays();
        
        console.log('Visualization initialized successfully');
        console.log(`Loaded ${timeseriesData.quarters.length} quarters of data`);
    } catch (error) {
        console.error('Error initializing visualization:', error);
    }
}

// Get current quarter data
function getCurrentQuarterData() {
    const quarter = timeseriesData.quarters[currentQuarterIndex];
    const provinces = {};
    const cmas = [];
    
    // Build provinces data for current quarter
    for (const [code, provinceData] of Object.entries(timeseriesData.provinces)) {
        provinces[code] = {
            code: code,
            name: provinceData.name,
            fullName: provinceData.fullName,
            payment: provinceData.quarters[quarter] || 0
        };
    }
    
    // Build CMAs data for current quarter
    for (const cma of timeseriesData.cmas) {
        cmas.push({
            name: cma.name,
            province: cma.province,
            lat: cma.lat,
            lon: cma.lon,
            payment: cma.quarters[quarter] || 0
        });
    }
    
    return { provinces, cmas, quarter };
}

// Setup SVG and projection
function setupSVG() {
    const container = d3.select('#canada-map');
    const width = 1400;
    const height = 900;
    
    svg = container
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');
    
    // Create projection for Canada (Albers projection works better for Canada)
    projection = d3.geoAlbers()
        .center([0, 58])
        .rotate([96, 0])
        .parallels([49, 77])
        .scale(1100)
        .translate([width / 2, height / 2]);
    
    path = d3.geoPath().projection(projection);
    
    // Create main group for zoom
    g = svg.append('g');
    
    // Add zoom behavior
    const zoom = d3.zoom()
        .scaleExtent([1, 8])  // Min and max zoom levels
        .on('zoom', (event) => {
            g.attr('transform', event.transform);
            
            // Scale strokes, circles, and text inversely to zoom level
            const scale = event.transform.k;
            g.selectAll('.province')
                .attr('stroke-width', 2 / scale);
            
            g.selectAll('.cma-marker')
                .attr('r', function() {
                    const baseRadius = d3.select(this).attr('data-base-radius');
                    return baseRadius / scale;
                })
                .attr('stroke-width', 2 / scale);
            
            g.selectAll('.cma-line')
                .attr('stroke-width', 1 / scale);
            
            g.selectAll('.cma-label')
                .attr('font-size', 11 / scale + 'px');
            
            g.selectAll('.province-label')
                .attr('font-size', 14 / scale + 'px');
        });
    
    svg.call(zoom);
}

// Draw provinces with color-coded affordability
function drawProvinces() {
    const provinces = g.selectAll('.province')
        .data(geoData.features)
        .enter()
        .append('path')
        .attr('class', 'province')
        .attr('d', path)
        .attr('fill', d => {
            const provinceData = getProvinceData(d.properties.name);
            return provinceData ? getColor(provinceData.payment, currentIncome) : '#cccccc';
        })
        .on('mouseover', handleProvinceMouseOver)
        .on('mousemove', handleMouseMove)
        .on('mouseout', handleMouseOut);
    
    // Add province labels
    g.selectAll('.province-label')
        .data(geoData.features)
        .enter()
        .append('text')
        .attr('class', 'province-label')
        .attr('transform', d => {
            const centroid = path.centroid(d);
            return `translate(${centroid[0]}, ${centroid[1]})`;
        })
        .text(d => provinceNameToCode[d.properties.name] || '')
        .attr('opacity', 0.7);
}

// Draw CMA markers and connecting lines
function drawCMAs() {
    const currentData = getCurrentQuarterData();
    const cmas = currentData.cmas;
    
    // Draw lines from CMAs to their locations
    cmas.forEach(cma => {
        const coords = projection([cma.lon, cma.lat]);
        const provinceFeature = geoData.features.find(f => f.properties.code === cma.province);
        
        if (provinceFeature && coords) {
            const provinceCentroid = path.centroid(provinceFeature);
            
            // Only draw line if CMA is significantly offset from province centroid
            const distance = Math.sqrt(
                Math.pow(coords[0] - provinceCentroid[0], 2) + 
                Math.pow(coords[1] - provinceCentroid[1], 2)
            );
            
            if (distance > 30) {
                g.append('line')
                    .attr('class', 'cma-line')
                    .attr('x1', coords[0])
                    .attr('y1', coords[1])
                    .attr('x2', provinceCentroid[0])
                    .attr('y2', provinceCentroid[1]);
            }
        }
    });
    
    // Draw CMA circles
    const cmaGroups = g.selectAll('.cma-group')
        .data(cmas)
        .enter()
        .append('g')
        .attr('class', 'cma-group')
        .attr('transform', d => {
            const coords = projection([d.lon, d.lat]);
            return coords ? `translate(${coords[0]}, ${coords[1]})` : null;
        })
        .style('cursor', 'pointer');
    
    cmaGroups.append('circle')
        .attr('class', 'cma-marker')
        .attr('r', d => {
            // Size based on payment amount (larger = more expensive)
            return Math.max(4, Math.min(12, d.payment / 300));
        })
        .attr('data-base-radius', d => Math.max(4, Math.min(12, d.payment / 300)))
        .attr('fill', d => getColor(d.payment, currentIncome))
        .attr('stroke', '#2c3e50')
        .attr('stroke-width', 2)
        .on('mouseover', handleCMAMouseOver)
        .on('mousemove', handleMouseMove)
        .on('mouseout', handleMouseOut);
    
    // Add labels for major CMAs
    const majorCMAs = ['Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa-Gatineau', 'Québec City'];
    
    cmaGroups.filter(d => majorCMAs.includes(d.name))
        .append('text')
        .attr('class', 'cma-label')
        .attr('dx', 10)
        .attr('dy', 4)
        .text(d => d.name);
}

// Province name to code mapping
const provinceNameToCode = {
    'Ontario': 'ON',
    'Quebec': 'QC',
    'British Columbia': 'BC',
    'Alberta': 'AB',
    'Manitoba': 'MB',
    'Saskatchewan': 'SK',
    'Nova Scotia': 'NS',
    'New Brunswick': 'NB',
    'Newfoundland and Labrador': 'NL',
    'Prince Edward Island': 'PE'
};

// Get province data by code or name
function getProvinceData(codeOrName) {
    const code = provinceNameToCode[codeOrName] || codeOrName;
    const currentData = getCurrentQuarterData();
    return currentData.provinces[code];
}

// Calculate affordability percentage
function calculateAffordability(monthlyPayment, annualIncome) {
    const monthlyIncome = annualIncome / 12;
    return (monthlyPayment / monthlyIncome) * 100;
}

// Get color based on affordability
function getColor(payment, income) {
    const affordabilityPercent = calculateAffordability(payment, income);
    return colorScale(affordabilityPercent);
}

// Get affordability status text
function getAffordabilityStatus(percent) {
    if (percent < 20) return { text: 'Very Affordable', badge: 'badge-very-affordable' };
    if (percent < 30) return { text: 'Affordable', badge: 'badge-affordable' };
    if (percent < 40) return { text: 'Borderline', badge: 'badge-borderline' };
    if (percent < 50) return { text: 'Unaffordable', badge: 'badge-unaffordable' };
    return { text: 'Very Unaffordable', badge: 'badge-very-unaffordable' };
}

// Get status color for tooltip
function getStatusColor(percent) {
    if (percent < 20) return '#5a9216';
    if (percent < 30) return '#7cb518';
    if (percent < 40) return '#ffc107';
    if (percent < 50) return '#ff6b35';
    return '#c1121f';
}

// Mouse event handlers
function handleProvinceMouseOver(event, d) {
    const provinceData = getProvinceData(d.properties.name);
    if (!provinceData) return;
    
    const affordabilityPercent = calculateAffordability(provinceData.payment, currentIncome);
    const status = getAffordabilityStatus(affordabilityPercent);
    
    const tooltip = d3.select('#tooltip');
    tooltip.html(`
        <h4>📍 ${provinceData.fullName}</h4>
        <p style="font-size: 1.3rem; color: #ffd700; margin: 10px 0;">
            <strong>Avg. Mortgage: $${provinceData.payment.toLocaleString()}/mo</strong>
        </p>
        <p><strong>Your Income:</strong> $${currentIncome.toLocaleString()}/year</p>
        <p><strong>Payment is:</strong> ${affordabilityPercent.toFixed(1)}% of monthly income</p>
        <p class="affordability-status" style="color: ${getStatusColor(affordabilityPercent)};">
            ● ${status.text}
        </p>
    `)
    .classed('visible', true);
    
    d3.select(event.currentTarget)
        .style('opacity', 0.8);
}

function handleCMAMouseOver(event, d) {
    const affordabilityPercent = calculateAffordability(d.payment, currentIncome);
    const status = getAffordabilityStatus(affordabilityPercent);
    
    const tooltip = d3.select('#tooltip');
    tooltip.html(`
        <h4>🏙️ ${d.name}</h4>
        <p style="font-size: 0.9rem; color: #aaa; margin: 2px 0;">${d.province}</p>
        <p style="font-size: 1.3rem; color: #ffd700; margin: 10px 0;">
            <strong>Avg. Mortgage: $${d.payment.toLocaleString()}/mo</strong>
        </p>
        <p><strong>Your Income:</strong> $${currentIncome.toLocaleString()}/year</p>
        <p><strong>Payment is:</strong> ${affordabilityPercent.toFixed(1)}% of monthly income</p>
        <p class="affordability-status" style="color: ${getStatusColor(affordabilityPercent)};">
            ● ${status.text}
        </p>
    `)
    .classed('visible', true);
    
    d3.select(event.currentTarget)
        .attr('r', function() {
            const currentRadius = parseFloat(d3.select(this).attr('r'));
            return currentRadius * 1.3;
        });
}

function handleMouseMove(event) {
    const tooltip = d3.select('#tooltip');
    const tooltipNode = tooltip.node();
    const tooltipWidth = tooltipNode ? tooltipNode.offsetWidth : 250;
    const tooltipHeight = tooltipNode ? tooltipNode.offsetHeight : 150;
    
    // Position tooltip to the right and slightly above the cursor
    let left = event.pageX + 20;
    let top = event.pageY - tooltipHeight / 2;
    
    // Check if tooltip would go off the right edge of the screen
    if (left + tooltipWidth > window.innerWidth) {
        left = event.pageX - tooltipWidth - 20; // Show on left side instead
    }
    
    // Check if tooltip would go off the top or bottom
    if (top < 10) {
        top = 10;
    } else if (top + tooltipHeight > window.innerHeight) {
        top = window.innerHeight - tooltipHeight - 10;
    }
    
    tooltip
        .style('left', left + 'px')
        .style('top', top + 'px');
}

function handleMouseOut(event) {
    d3.select('#tooltip').classed('visible', false);
    
    // Reset province opacity
    d3.select(event.currentTarget)
        .style('opacity', 1);
    
    // Reset CMA circle size
    if (event.currentTarget.tagName === 'circle' && event.currentTarget.classList.contains('cma-marker')) {
        const payment = d3.select(event.currentTarget).datum().payment;
        d3.select(event.currentTarget)
            .attr('r', Math.max(4, Math.min(12, payment / 300)));
    }
}

// Setup income slider controls
function setupControls() {
    const slider = d3.select('#income-slider');
    const display = d3.select('#income-display');
    
    slider.on('input', function() {
        currentIncome = +this.value;
        display.text('$' + currentIncome.toLocaleString());
        updateVisualization();
    });
}

// Setup timeline controls
function setupTimelineControls() {
    const timelineSlider = d3.select('#timeline-slider');
    const quarterDisplay = d3.select('#quarter-display');
    const playButton = d3.select('#play-button');
    const resetButton = d3.select('#reset-button');
    
    // Timeline slider
    timelineSlider.on('input', function() {
        if (isPlaying) {
            stopAnimation();
        }
        currentQuarterIndex = +this.value;
        updateQuarterDisplay();
        updateVisualization();
    });
    
    // Play/Pause button
    playButton.on('click', function() {
        if (isPlaying) {
            stopAnimation();
        } else {
            startAnimation();
        }
    });
    
    // Reset button
    resetButton.on('click', function() {
        stopAnimation();
        currentQuarterIndex = 0;
        timelineSlider.property('value', 0);
        updateQuarterDisplay();
        updateVisualization();
    });
    
    updateQuarterDisplay();
}

// Update quarter display
function updateQuarterDisplay() {
    const quarter = timeseriesData.quarters[currentQuarterIndex];
    const year = quarter.substring(0, 4);
    const q = quarter.substring(4);
    d3.select('#quarter-display').text(`${year} ${q}`);
    d3.select('#timeline-slider').property('value', currentQuarterIndex);
}

// Start animation
function startAnimation() {
    isPlaying = true;
    d3.select('#play-button')
        .text('⏸ Pause')
        .classed('playing', true);
    
    animationInterval = setInterval(() => {
        currentQuarterIndex++;
        if (currentQuarterIndex >= timeseriesData.quarters.length) {
            currentQuarterIndex = 0;  // Loop back to start
        }
        updateQuarterDisplay();
        updateVisualization();
    }, 500);  // Update every 500ms
}

// Stop animation
function stopAnimation() {
    isPlaying = false;
    d3.select('#play-button')
        .text('▶ Play')
        .classed('playing', false);
    
    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }
}

// Update visualization when income or quarter changes
function updateVisualization() {
    const currentData = getCurrentQuarterData();
    
    // Update province colors
    g.selectAll('.province')
        .transition()
        .duration(300)
        .attr('fill', d => {
            const provinceData = getProvinceData(d.properties.name);
            return provinceData ? getColor(provinceData.payment, currentIncome) : '#cccccc';
        });
    
    // Remove old CMAs
    g.selectAll('.cma-group').remove();
    g.selectAll('.cma-line').remove();
    
    // Redraw CMAs with new data
    const cmas = currentData.cmas;
    
    // Draw lines
    cmas.forEach(cma => {
        const coords = projection([cma.lon, cma.lat]);
        const provinceFeature = geoData.features.find(f => f.properties.code === cma.province);
        
        if (provinceFeature && coords) {
            const provinceCentroid = path.centroid(provinceFeature);
            const distance = Math.sqrt(
                Math.pow(coords[0] - provinceCentroid[0], 2) + 
                Math.pow(coords[1] - provinceCentroid[1], 2)
            );
            
            if (distance > 30) {
                g.append('line')
                    .attr('class', 'cma-line')
                    .attr('x1', coords[0])
                    .attr('y1', coords[1])
                    .attr('x2', provinceCentroid[0])
                    .attr('y2', provinceCentroid[1]);
            }
        }
    });
    
    // Draw CMA circles
    const cmaGroups = g.selectAll('.cma-group')
        .data(cmas)
        .enter()
        .append('g')
        .attr('class', 'cma-group')
        .attr('transform', d => {
            const coords = projection([d.lon, d.lat]);
            return coords ? `translate(${coords[0]}, ${coords[1]})` : null;
        })
        .style('cursor', 'pointer');
    
    cmaGroups.append('circle')
        .attr('class', 'cma-marker')
        .attr('r', d => Math.max(4, Math.min(12, d.payment / 300)))
        .attr('data-base-radius', d => Math.max(4, Math.min(12, d.payment / 300)))
        .attr('fill', d => getColor(d.payment, currentIncome))
        .attr('stroke', '#2c3e50')
        .attr('stroke-width', 2)
        .on('mouseover', handleCMAMouseOver)
        .on('mousemove', handleMouseMove)
        .on('mouseout', handleMouseOut);
    
    // Add labels for major cities
    const majorCMAs = ['Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa-Gatineau', 'Québec City'];
    cmaGroups.filter(d => majorCMAs.includes(d.name))
        .append('text')
        .attr('class', 'cma-label')
        .attr('dx', 10)
        .attr('dy', 4)
        .text(d => d.name);
    
    // Update displays
    updateAllDisplays();
}

// Update all information displays
function updateAllDisplays() {
    updateNationalInfo();
    updateProvinceExtremes();
    updateDataTable();
}

// Update national information
function updateNationalInfo() {
    const currentData = getCurrentQuarterData();
    // Calculate national average from all provinces
    const provincePayments = Object.values(currentData.provinces).map(p => p.payment);
    const nationalPayment = Math.round(provincePayments.reduce((a, b) => a + b, 0) / provincePayments.length);
    
    const affordabilityPercent = calculateAffordability(nationalPayment, currentIncome);
    const status = getAffordabilityStatus(affordabilityPercent);
    
    d3.select('#national-payment').text('$' + nationalPayment.toLocaleString());
    d3.select('#national-affordability')
        .text(`${affordabilityPercent.toFixed(1)}% of monthly income - ${status.text}`);
}

// Update most/least affordable provinces
function updateProvinceExtremes() {
    const currentData = getCurrentQuarterData();
    const provincesWithAffordability = Object.values(currentData.provinces).map(p => ({
        ...p,
        affordability: calculateAffordability(p.payment, currentIncome)
    }));
    
    provincesWithAffordability.sort((a, b) => a.affordability - b.affordability);
    
    const mostAffordable = provincesWithAffordability[0];
    const leastAffordable = provincesWithAffordability[provincesWithAffordability.length - 1];
    
    d3.select('#most-affordable-province').text(mostAffordable.fullName);
    d3.select('#most-affordable-payment')
        .text(`$${mostAffordable.payment.toLocaleString()}/mo (${mostAffordable.affordability.toFixed(1)}%)`);
    
    d3.select('#least-affordable-province').text(leastAffordable.fullName);
    d3.select('#least-affordable-payment')
        .text(`$${leastAffordable.payment.toLocaleString()}/mo (${leastAffordable.affordability.toFixed(1)}%)`);
}

// Update data table
function updateDataTable() {
    const currentData = getCurrentQuarterData();
    const provincesWithAffordability = Object.values(currentData.provinces).map(p => ({
        ...p,
        affordability: calculateAffordability(p.payment, currentIncome)
    }));
    
    provincesWithAffordability.sort((a, b) => a.affordability - b.affordability);
    
    const tbody = d3.select('#table-body');
    tbody.selectAll('tr').remove();
    
    const rows = tbody.selectAll('tr')
        .data(provincesWithAffordability)
        .enter()
        .append('tr');
    
    rows.append('td').text(d => d.fullName);
    rows.append('td').text(d => '$' + d.payment.toLocaleString());
    rows.append('td').text(d => d.affordability.toFixed(1) + '%');
    rows.append('td')
        .html(d => {
            const status = getAffordabilityStatus(d.affordability);
            return `<span class="affordability-badge ${status.badge}">${status.text}</span>`;
        });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
