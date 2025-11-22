function initCityMap() {
    const mapContainerSel = d3.select('#map');
    if (mapContainerSel.empty()) {
        console.warn('Map container not found');
        return;
    }

    // Clear existing content and set container styles
    mapContainerSel.html('');
    mapContainerSel.style('position', 'relative')
        .style('overflow', 'visible')
        .style('width', '100%')
        .style('min-height', '900px')
        .style('display', 'flex')
        .style('gap', '20px');

    // Create left container for map (d3 selection)
    const mapAreaContainer = mapContainerSel.append('div')
        .attr('class', 'map-area-container')
        .style('flex', '1')
        .style('min-width', '0')
        .style('position', 'relative');

    // Create right container for chart panel (d3 selection)
    const chartPanelContainer = mapContainerSel.append('div')
        .attr('class', 'chart-panel-container')
        .style('width', '420px')
        .style('height', '900px')
        .style('flex-shrink', '0')
        .style('position', 'relative')
        .style('background', 'rgba(255, 255, 255, 0.98)')
        .style('border-radius', '10px')
        .style('box-shadow', '0 4px 16px rgba(0,0,0,0.2)')
        .style('padding', '20px')
        .style('display', 'flex')
        .style('flex-direction', 'column');

    // State for current selected year and city
    let currentYear = 2024; // default to most recent year
    let selectedCity = null;
    let selectedHousingType = 'All'; // Always use average across all housing types
    
    // Placeholder functions that will be replaced after data loads
    let updateCityColors = function() {
        // no-op until data loads
    };
    
    let recalculateRentData = function() {
        // no-op until data loads
    };
    
    let getCityColor = function(cityName) {
        return '#999'; // gray until data loads
    };
    let rentalData = {}; // will store rental data by city
    let provinceAverages = {}; // { provinceName: { year: avgRent } }
    let canadaAverages = {}; // { year: avgRent }
    let cityToProvince = {}; // Map city names to their province
    
    // Shared legend/color state (must be outside Promise.all scope)
    let globalMinRent = Infinity;
    let globalMaxRent = -Infinity;
    let rentColorScale; // initialized in recalculateRentData()
    
    // Match first visualization structure
    const width = 1200;
    const height = 900;

    const svg = mapAreaContainer
        .append('svg')
        .attr('width', '100%')
        .attr('height', height)
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');

    // Create main group for zoom (simplified structure like first visualization)
    const g = svg.append('g');
    const gProvinces = g.append('g').attr('class', 'province-layer');
    const gCities = g.append('g').attr('class', 'city-layer');

    const tooltip = d3.select('body')
        .append('div')
        .attr('class', 'map-tooltip')
        .style('position', 'fixed')
        .style('pointer-events', 'none')
        .style('background', '#ffffff')
        .style('border', '1px solid #ccc')
        .style('border-radius', '10px')
        .style('padding', '6px 10px')
        .style('font-size', '12px')
        .style('box-shadow', '0 2px 6px rgba(0,0,0,0.1)')
        .style('display', 'none')
        .style('opacity', 0)
        .style('z-index', '10000')
        .style('white-space', 'nowrap')
        .style('transition', 'opacity 0.2s');

    // Add timeline container at bottom-right (year filter only)
    const timelineContainer = mapAreaContainer
        .append('div')
        .attr('class', 'timeline-container')
        .style('position', 'absolute')
        .style('bottom', '20px')
        .style('right', '20px')
        .style('background', 'rgba(255, 255, 255, 0.95)')
        .style('padding', '10px 15px')
        .style('border-radius', '8px')
        .style('box-shadow', '0 2px 8px rgba(0,0,0,0.15)')
        .style('z-index', '1000')
        .style('display', 'flex')
        .style('gap', '12px')
        .style('align-items', 'center');

    // Year filter section (all controls in one line now)
    const yearFilterSection = timelineContainer.append('div')
        .style('display', 'flex')
        .style('gap', '12px')
        .style('align-items', 'center');

    const years = d3.range(2010, 2025); // Generate array [2010, 2011, ..., 2024]
    
    // Add year label
    yearFilterSection.append('span')
        .style('font-size', '14px')
        .style('font-weight', '600')
        .style('color', '#2d3748')
        .text('Year:');
    
    // Create year display
    const yearDisplay = yearFilterSection.append('span')
        .style('font-size', '16px')
        .style('font-weight', '700')
        .style('color', '#4a5568')
        .style('min-width', '45px')
        .style('text-align', 'center')
        .text(currentYear);
    
    // Divider between year display and slider for visual separation
    const yearDivider = yearFilterSection.append('div')
        .attr('class', 'year-divider')
        .style('width', '1px')
        .style('height', '28px')
        .style('background', 'rgba(15,23,42,0.06)')
        .style('margin', '0 12px')
        .style('align-self', 'center');

    // Create slider container
    const sliderContainer = yearFilterSection.append('div')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('gap', '8px');
    
    // Min year label
    sliderContainer.append('span')
        .style('font-size', '12px')
        .style('color', '#718096')
        .text('2010');
    
    // Create range slider
    const yearSlider = sliderContainer.append('input')
        .attr('type', 'range')
        .attr('min', 2010)
        .attr('max', 2024)
        .attr('value', currentYear)
        .attr('step', 1)
        .style('width', '200px')
        .style('cursor', 'pointer')
        .style('accent-color', '#4a5568')
        .on('input', function() {
            const newYear = +this.value;
            if (newYear !== currentYear) {
                currentYear = newYear;
                
                // Update year display
                yearDisplay.text(currentYear);
                // Update year note in chart panel (if present)
                try {
                    if (typeof yearNote !== 'undefined' && yearNote) {
                        yearNote.text(`Values shown are for the year selected on the map: ${currentYear}`);
                    }
                } catch (e) {
                    // ignore if yearNote not yet available
                }
                
                // Update city colors and visibility for new year
                updateCityColors();
                
                // Update line chart if a city is selected
                if (selectedCity) {
                    updateLineChart(selectedCity);
                }
            }
        });
    
    // Max year label
    sliderContainer.append('span')
        .style('font-size', '12px')
        .style('color', '#718096')
        .text('2024');

    // Add zoom controls container
    const controlsContainer = mapAreaContainer
        .append('div')
        .attr('class', 'map-controls')
        .style('position', 'absolute')
        .style('top', '10px')
        .style('left', '10px')
        .style('display', 'flex')
        .style('flex-direction', 'column')
        .style('gap', '10px')
        .style('z-index', '1000');

    // Zoom controls group
    const zoomGroup = controlsContainer.append('div')
        .style('display', 'flex')
        .style('flex-direction', 'column')
        .style('gap', '5px');

    const zoomInBtn = zoomGroup.append('button')
        .attr('class', 'zoom-btn rentalpricemap-btn')
        .text('+');

    const zoomOutBtn = zoomGroup.append('button')
        .attr('class', 'zoom-btn rentalpricemap-btn')
        .text('−');

    const resetBtn = zoomGroup.append('button')
        .attr('class', 'zoom-btn rentalpricemap-btn reset')
        .text('Reset');
    
    // Close button to hide the chart panel
    const closeBtn = chartPanelContainer.append('button')
        .attr('class', 'chart-close-btn')
        .attr('aria-label', 'Close chart')
        .style('position', 'absolute')
        .style('top', '10px')
        .style('right', '10px')
        // Make button visually prominent but not obtrusive
        .style('background', 'rgba(239,68,68,0.06)')
        .style('border', '1px solid rgba(239,68,68,0.18)')
        .style('color', '#ef4444')
        .style('font-size', '18px')
        .style('line-height', '1')
        .style('padding', '6px 8px')
        .style('border-radius', '8px')
        .style('cursor', 'pointer')
        .style('box-shadow', '0 4px 10px rgba(239,68,68,0.06)')
        .style('transition', 'transform 120ms ease, background 120ms ease, color 120ms ease')
        // Hidden initially when showing the "Explore" instructions
        .style('display', 'none')
        .text('✕')
        .on('mouseenter', function() {
            d3.select(this)
                .style('transform', 'translateY(-1px) scale(1.02)')
                .style('background', 'rgba(239,68,68,0.12)')
                .style('color', '#b91c1c');
        })
        .on('mouseleave', function() {
            d3.select(this)
                .style('transform', null)
                .style('background', 'rgba(239,68,68,0.06)')
                .style('color', '#ef4444');
        })
        .on('click', function() {
            // Close the chart and deselect the city
            selectedCity = null;
            chartContent.style('display', 'none');
            instructionsDiv.style('display', 'flex');

            // Hide the close button when showing the instructions
            try { closeBtn.style('display', 'none'); } catch (e) {}

            // Reset all city circle colors
            if (typeof cityCircles !== 'undefined') {
                cityCircles.each(function(c) {
                    d3.select(this).attr('fill', getCityColor(c.city));
                });
            }
        });
    
    // Instructions div (shown when no city is selected)
    const instructionsDiv = chartPanelContainer.append('div')
        .attr('class', 'chart-instructions')
        .style('display', 'flex')
        .style('flex-direction', 'column')
        .style('align-items', 'center')
        .style('justify-content', 'center')
        .style('height', '100%')
        .style('text-align', 'center')
        .style('color', '#64748b')
        .style('padding', '20px');
    
    instructionsDiv.append('div')
        .style('font-size', '18px')
        .style('font-weight', '600')
        .style('margin-bottom', '15px')
        .style('color', '#475569')
        .text('Explore Rental Prices');
    
    instructionsDiv.append('div')
        .style('font-size', '14px')
        .style('line-height', '1.6')
        .style('color', '#64748b')
        .text('Click on any city on the map to view its average rental price trends over time, compared with provincial and national averages.');
    
    // Chart content div (hidden initially, shown when city is selected)
    const chartContent = chartPanelContainer.append('div')
        .attr('class', 'chart-content')
        .style('display', 'none')
        .style('flex-direction', 'column')
        .style('height', '100%');
    
    
    
    // SVG for line chart 
    const chartSvg = chartContent.append('svg')
        .attr('width', '100%')
        .attr('height', '60%')
        .style('flex', '0 0 auto')
        .style('max-height', '720px')
        .style('min-height', '300px');

    // Insert chart title 
    const chartTitle = chartContent.insert('div', 'svg')
        .attr('class', 'chart-title')
        .style('font-size', '16px')
        .style('font-weight', '600')
        .style('color', '#2d3748')
        .style('margin-bottom', '6px')
        .style('flex-shrink', '0');

    const chartMargin = { top: 36, right: 20, bottom: 40, left: 80 };

    const chartG = chartSvg.append('g')
        .attr('transform', `translate(${chartMargin.left},${chartMargin.top})`);

    // After the SVG: legend then chart info (so order is: title, svg, legend, info)
    const legendDiv = chartContent.append('div')
        .attr('class', 'chart-legend')
        .style('display', 'flex')
        .style('flex-direction', 'column')
        .style('gap', '6px')
        .style('align-items', 'stretch')
        .style('margin-top', '12px')
        .style('padding-top', '8px')
        .style('border-top', '1px solid rgba(0,0,0,0.06)');

    const chartInfo = chartContent.append('div')
        .attr('class', 'chart-info')
        .style('display', 'flex')
        .style('flex-direction', 'column')
        .style('gap', '8px')
        .style('margin-top', '12px')
        .style('padding-top', '6px')
        .style('border-top', '1px solid rgba(0,0,0,0.06)');

    const yearNote = chartInfo.append('div')
        .attr('class', 'year-note')
        .style('font-size', '14px')
        .style('color', '#1e293b')
        .style('font-weight', '600')
        .style('background', 'rgba(59,130,246,0.06)')
        .style('padding', '6px 8px')
        .style('border-radius', '6px')
        .style('display', 'inline-block')
        .style('margin-bottom', '6px')
        .style('letter-spacing', '0.2px')
        .style('align-self', 'flex-start')
        .text(`Values shown are for the year selected on the map: ${currentYear}`);

    const factsDiv = chartInfo.append('div')
        .attr('class', 'chart-facts')
        .style('font-size', '13px')
        .style('color', '#374151')
        .style('line-height', '1.4');

    // Visibility map for toggling lines/points
    let visibleLines = { 0: true, 1: true, 2: true };
    
    // Create tooltip for chart data points
    const chartTooltip = d3.select('body')
        .append('div')
        .attr('class', 'chart-tooltip')
        .style('position', 'fixed')
        .style('pointer-events', 'none')
        .style('background', 'rgba(0, 0, 0, 0.85)')
        .style('color', '#fff')
        .style('border-radius', '6px')
        .style('padding', '8px 12px')
        .style('font-size', '12px')
        .style('font-weight', '600')
        .style('box-shadow', '0 2px 8px rgba(0,0,0,0.2)')
        .style('display', 'none')
        .style('opacity', 0)
        .style('z-index', '10001')
        .style('white-space', 'nowrap')
        .style('transition', 'opacity 0.2s');
    
    // use same geojson as vis 1 now
    const PROVINCES_URL = 'data/canada_provinces.json';

    function updateLineChart(city) {
        if (!city || !rentalData[city.city]) {
            return;
        }
        
        // Show chart content, hide instructions
        instructionsDiv.style('display', 'none');
        chartContent.style('display', 'flex');
        // Show the close button when an actual chart is displayed
        try { closeBtn.style('display', 'block'); } catch (e) {}
        
        const cityName = city.city;
        const provinceName = cityToProvince[cityName];
        
        chartTitle.text(`${cityName} - Average Rental Prices`);
        // Update the year-note to describe the comparison shown
        if (typeof yearNote !== 'undefined' && yearNote) {
            yearNote.text(`${cityName} comparison with ${provinceName || 'Province'} and Canada rental average in ${currentYear}`);
        }
        
        const cityRentalData = rentalData[cityName];
        const allYears = d3.range(2010, 2025);
        
        // Prepare city average data
        const cityData = allYears.map(year => {
            if (cityRentalData[year]) {
                const yearData = cityRentalData[year];
                const rentValues = Object.values(yearData).filter(v => v > 0);
                if (rentValues.length > 0) {
                    return rentValues.reduce((a, b) => a + b, 0) / rentValues.length;
                }
            }
            return null;
        });
        
        // Prepare province average data
        const provinceData = allYears.map(year => {
            if (provinceName && provinceAverages[provinceName] && provinceAverages[provinceName][year]) {
                return provinceAverages[provinceName][year];
            }
            return null;
        });
        
        // Prepare Canada average data
        const canadaData = allYears.map(year => {
            return canadaAverages[year] || null;
        });
        
        // Calculate dynamic sizes based on the rendered SVG size (use actual SVG clientHeight)
        const svgNode = chartSvg.node();
        const svgWidth = svgNode.clientWidth || svgNode.getBoundingClientRect().width;

        let svgHeight = svgNode.clientHeight || svgNode.getBoundingClientRect().height;
        if (!svgHeight || svgHeight < 10) {
            const titleH = chartTitle.node() ? chartTitle.node().getBoundingClientRect().height : 0;
            const infoH = chartInfo.node() ? chartInfo.node().getBoundingClientRect().height : 0;
            const available = (chartContent.node() ? chartContent.node().clientHeight : 0) - titleH - infoH - 20;
            svgHeight = Math.max(240, Math.min(720, available > 0 ? available : 420));
        }

        const innerWidth = svgWidth - chartMargin.left - chartMargin.right;
        const innerHeight = svgHeight - chartMargin.top - chartMargin.bottom;
        const xAxisRightPadding = 16; 
        const plotWidth = Math.max(120, innerWidth - xAxisRightPadding);

        // Clear previous chart
        chartG.selectAll('*').remove();
        factsDiv.html('');
        factsDiv.html('');
        
        // Scales
        const xScale = d3.scaleLinear()
            .domain([2010, 2024])
            .range([0, plotWidth]);
        
        const allValues = [...cityData, ...provinceData, ...canadaData].filter(v => v !== null);
        
        if (allValues.length === 0) {
                chartG.append('text')
                    .attr('x', plotWidth / 2)
                    .attr('y', innerHeight / 2)
                .attr('text-anchor', 'middle')
                .style('fill', '#999')
                .text('No data available');
            return;
        }
        
            const yScale = d3.scaleLinear()
                .domain([0, d3.max(allValues) * 1.1])
                .range([innerHeight, 0]);
        
        // Axes
        chartG.append('g')
            .attr('transform', `translate(0,${innerHeight})`)
            .call(d3.axisBottom(xScale).ticks(8).tickFormat(d3.format('d')))
            .style('font-size', '11px');
        
        chartG.append('g')
            .call(d3.axisLeft(yScale).ticks(6).tickFormat(d => '$' + Math.round(d)))
            .style('font-size', '11px');
        
        // Y-axis label (moved further left; ensure left margin is large enough to keep it visible)
        chartG.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', -65)
            .attr('x', -innerHeight / 2)
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('font-weight', '600')
            .style('fill', '#666')
            .text('Average Monthly Rent ($)');
        
        // Line generator
        const line = d3.line()
            .defined(d => d !== null)
            .x((d, i) => xScale(allYears[i]))
            .y(d => yScale(d));
        
        // Define colors and labels for each line
        const lineConfig = [
            { data: canadaData, color: '#94a3b8', label: 'Canada Average', width: 2, dash: '5,5' },
            { data: provinceData, color: '#3b82f6', label: provinceName || 'Province Average', width: 2.5, dash: 'none' },
            { data: cityData, color: '#ef4444', label: cityName, width: 3, dash: 'none' }
        ];
        
        // Draw lines
        lineConfig.forEach((config, configIndex) => {
            if (config.data.some(v => v !== null)) {
                // Path with class for toggling
                chartG.append('path')
                    .datum(config.data)
                    .attr('class', `line-${configIndex}`)
                    .attr('fill', 'none')
                    .attr('stroke', config.color)
                    .attr('stroke-width', config.width)
                    .attr('stroke-dasharray', config.dash)
                    .attr('d', line);

                // Add interactive points for all lines (grouped)
                const pointsGroup = chartG.append('g').attr('class', `points-${configIndex}`);
                pointsGroup.selectAll(`.point-line-${configIndex}`)
                    .data(config.data)
                    .join('circle')
                    .attr('class', `point-line-${configIndex}`)
                    .attr('cx', (d, i) => xScale(allYears[i]))
                    .attr('cy', d => d !== null ? yScale(d) : null)
                    .attr('r', d => d !== null ? 4 : 0)
                    .attr('fill', config.color)
                    .attr('stroke', '#fff')
                    .attr('stroke-width', 2)
                    .style('cursor', 'pointer')
                    .on('mouseenter', function(event, d) {
                        if (d !== null) {
                            const yearIndex = config.data.indexOf(d);
                            d3.select(this)
                                .transition()
                                .duration(100)
                                .attr('r', 6);

                            chartTooltip
                                .html(`<strong>${config.label}</strong><br/>${allYears[yearIndex]}: <strong>$${Math.round(d)}</strong>`)
                                .style('display', 'block')
                                .style('opacity', 1)
                                .style('left', (event.clientX + 10) + 'px')
                                .style('top', (event.clientY - 10) + 'px');
                        }
                    })
                    .on('mousemove', function(event) {
                        chartTooltip
                            .style('left', (event.clientX + 10) + 'px')
                            .style('top', (event.clientY - 10) + 'px');
                    })
                    .on('mouseleave', function() {
                        d3.select(this)
                            .transition()
                            .duration(100)
                            .attr('r', 4);

                        chartTooltip
                            .style('display', 'none')
                            .style('opacity', 0);
                    });
            }
        });
        
        // Populate HTML legend above the SVG to keep a gap from the plotted area
        legendDiv.html('');
        // Build a list of visible legend entries (preserve original indices)
        const visibleConfigs = lineConfig.map((cfg, idx) => ({ cfg, idx }))
            .filter(item => item.cfg.data.some(v => v !== null));

        visibleConfigs.forEach(({ cfg: config, idx }, vIdx) => {
            const row = legendDiv.append('div')
                .attr('class', 'legend-row')
                .style('display', 'flex')
                .style('align-items', 'center')
                .style('gap', '8px')
                .style('cursor', 'pointer')
                .style('padding', '8px 6px');

            // add bottom separator except for last
            if (vIdx < visibleConfigs.length - 1) {
                row.style('border-bottom', '1px solid rgba(0,0,0,0.06)');
            }

            // sample area 
            const sample = row.append('svg').attr('width', 56).attr('height', 18);
            sample.append('line')
                .attr('x1', 6)
                .attr('x2', 40)
                .attr('y1', 9)
                .attr('y2', 9)
                .attr('stroke', config.color)
                .attr('stroke-width', Math.max(2, config.width))
                .attr('stroke-dasharray', config.dash);
            sample.append('circle')
                .attr('cx', 23)
                .attr('cy', 9)
                .attr('r', 4)
                .attr('fill', config.color)
                .attr('stroke', '#fff')
                .attr('stroke-width', 1.5);

            row.append('div')
                .text(config.label)
                .style('font-size', '13px')
                .style('font-weight', '600')
                .style('color', '#374151')
                .style('margin-left', '8px');

            // Toggle visibility on click (use original index 'idx')
            row.on('click', function(event) {
                visibleLines[idx] = !visibleLines[idx];
                const show = visibleLines[idx];
                chartG.selectAll(`.line-${idx}`).style('display', show ? null : 'none');
                chartG.selectAll(`.points-${idx}`).style('display', show ? null : 'none');
                d3.select(this).style('opacity', show ? 1 : 0.45);
            });
        });

        // Compute simple textual facts comparing latest year (currentYear) values
        const yearIndex = allYears.indexOf(currentYear) !== -1 ? allYears.indexOf(currentYear) : allYears.length - 1;
        const cityLatest = cityData[yearIndex];
        const provinceLatest = provinceData[yearIndex];
        const canadaLatest = canadaData[yearIndex];

        let factsHtml = '';
        if (cityLatest == null) {
            factsHtml += `<div>No city data available for ${currentYear}.</div>`;
        } else {
            if (canadaLatest != null) {
                const diff = Math.round(cityLatest - canadaLatest);
                const pct = canadaLatest > 0 ? Math.round(((cityLatest - canadaLatest) / canadaLatest) * 100) : 0;
                const rel = pct >= 0 ? 'higher' : 'lower';
                factsHtml += `<div>${cityName}'s average rent ($${Math.round(cityLatest)}) is ${Math.abs(pct)}% ${rel} than the Canada average ($${Math.round(canadaLatest)}).</div>`;
            } else {
                factsHtml += `<div>Canada average not available for ${currentYear}.</div>`;
            }

            if (provinceLatest != null) {
                const diffP = Math.round(cityLatest - provinceLatest);
                const pctP = provinceLatest > 0 ? Math.round(((cityLatest - provinceLatest) / provinceLatest) * 100) : 0;
                const relP = pctP >= 0 ? 'higher' : 'lower';
                factsHtml += `<div>${cityName}'s average rent ($${Math.round(cityLatest)}) is ${Math.abs(pctP)}% ${relP} than the ${provinceName} average ($${Math.round(provinceLatest)}).</div>`;
            } else {
                factsHtml += `<div>${provinceName} average not available for ${currentYear}.</div>`;
            }
        }

        factsDiv.html(factsHtml);
    }

    // load data
    Promise.all([
        d3.json(PROVINCES_URL),
        d3.csv('data/canadacities_clean.csv'),
        d3.csv('data/rental_city_merged.csv')
    ]).then(function(results) {
        const provincesGeo = results[0];
        const rows = results[1];
        const rentalRows = results[2];
        
        // Build city to province mapping first
        rows.forEach(r => {
            const city = r.city;
            const province = r.province;
            if (city && province) {
                cityToProvince[city] = province;
            }
        });
        
        // Process rental data
        rentalRows.forEach(r => {
            const city = r.city;
            const year = +r.year;
            const housingType = r.housing_type;
            const rentPrice = +r.rent_price;
            
            if (!rentalData[city]) {
                rentalData[city] = {};
            }
            if (!rentalData[city][year]) {
                rentalData[city][year] = {};
            }
            // Average if multiple structure types exist
            if (rentalData[city][year][housingType]) {
                rentalData[city][year][housingType] = (rentalData[city][year][housingType] + rentPrice) / 2;
            } else {
                rentalData[city][year][housingType] = rentPrice;
            }
        });
        
        // Calculate province and Canada averages
        const allYears = d3.range(2010, 2025);
        
        // Structure to accumulate values: { province: { year: [values] } }
        const provinceYearValues = {};
        const canadaYearValues = {};
        
        // Initialize structures
        allYears.forEach(year => {
            canadaYearValues[year] = [];
        });
        
        // Accumulate all city rental values by province and year
        Object.keys(rentalData).forEach(cityName => {
            const province = cityToProvince[cityName];
            if (!province) return;
            
            if (!provinceYearValues[province]) {
                provinceYearValues[province] = {};
                allYears.forEach(year => {
                    provinceYearValues[province][year] = [];
                });
            }
            
            Object.keys(rentalData[cityName]).forEach(year => {
                const yearData = rentalData[cityName][year];
                const housingTypes = Object.keys(yearData);
                if (housingTypes.length > 0) {
                    // Calculate average across all housing types for this city-year
                    const rentValues = housingTypes.map(type => yearData[type]).filter(v => v > 0);
                    if (rentValues.length > 0) {
                        const avgRent = rentValues.reduce((a, b) => a + b, 0) / rentValues.length;
                        provinceYearValues[province][year].push(avgRent);
                        canadaYearValues[year].push(avgRent);
                    }
                }
            });
        });
        
        // Calculate province averages
        Object.keys(provinceYearValues).forEach(province => {
            provinceAverages[province] = {};
            allYears.forEach(year => {
                const values = provinceYearValues[province][year];
                if (values.length > 0) {
                    provinceAverages[province][year] = values.reduce((a, b) => a + b, 0) / values.length;
                }
            });
        });
        
        // Calculate Canada averages
        allYears.forEach(year => {
            const values = canadaYearValues[year];
            if (values.length > 0) {
                canadaAverages[year] = values.reduce((a, b) => a + b, 0) / values.length;
            }
        });
        
        // Calculate average rent for each city-year and find global min/max for consistent color scale
        const cityAverageRents = {}; // { cityName: { year: avgRent } }
        
        const legendContainer = mapAreaContainer
            .append('div')
            .attr('class', 'rent-legend')
            .attr('id', 'rent-legend')
            .style('position', 'absolute')
            .style('bottom', '20px')
            .style('left', '20px')
            .style('background', 'rgba(255, 255, 255, 0.95)')
            .style('padding', '15px')
            .style('border-radius', '8px')
            .style('box-shadow', '0 2px 8px rgba(0,0,0,0.15)')
            .style('z-index', '1000')
            .style('font-size', '12px')
            .style('width', '280px');
        
        legendContainer.append('div')
            .attr('class', 'legend-title')
            .style('font-weight', '600')
            .style('margin-bottom', '8px')
            .style('color', '#2d3748')
            .style('text-align', 'center')
            .text('Average Rent/Month');
        
        const legendSvg = legendContainer.append('svg')
            .attr('width', 250)
            .attr('height', 50)
            .style('display', 'block')
            .style('margin', '0 auto');
        
        // Create gradient for legend
        const defs = legendSvg.append('defs');
        defs.append('linearGradient')
            .attr('id', 'rent-gradient-housing')
            .attr('x1', '0%')
            .attr('x2', '100%');
        
        // Draw gradient rectangle
        legendSvg.append('rect')
            .attr('x', 0)
            .attr('y', 5)
            .attr('width', 250)
            .attr('height', 20)
            .style('fill', 'url(#rent-gradient-housing)')
            .style('stroke', '#ccc')
            .style('stroke-width', 1);
        
        // Add labels (text will be updated by updateLegend)
        legendSvg.append('text')
            .attr('class', 'legend-min-label')
            .attr('x', 0)
            .attr('y', 38)
            .style('font-size', '11px')
            .style('fill', '#666');
        
        legendSvg.append('text')
            .attr('class', 'legend-max-label')
            .attr('x', 250)
            .attr('y', 38)
            .attr('text-anchor', 'end')
            .style('font-size', '11px')
            .style('fill', '#666');
        
    // Function to update the legend display
    function updateLegend() {
            // Update legend title
            const titleElement = d3.select('#rent-legend .legend-title');
            titleElement.text('Average Rent/Month');
            
            // Update legend labels with new min/max
            const minLabel = d3.select('#rent-legend .legend-min-label');
            const maxLabel = d3.select('#rent-legend .legend-max-label');
            minLabel.text(`$${Math.round(globalMinRent)}`);
            maxLabel.text(`$${Math.round(globalMaxRent)}`);
            
            // Update gradient stops
            const linearGradient = d3.select('#rent-gradient-housing');
            linearGradient.selectAll('stop').remove();
            
            const numStops = 10;
            for (let i = 0; i <= numStops; i++) {
                const offset = (i / numStops) * 100;
                const value = globalMinRent + (globalMaxRent - globalMinRent) * (i / numStops);
                linearGradient.append('stop')
                    .attr('offset', `${offset}%`)
                    .attr('stop-color', rentColorScale(value));
            }
        }        // Function to recalculate rent data based on current housing type filter
        recalculateRentData = function() {
            // Clear previous calculations
            Object.keys(rentalData).forEach(cityName => {
                cityAverageRents[cityName] = {};
            });
            globalMinRent = Infinity;
            globalMaxRent = -Infinity;
            
            // Recalculate based on selected housing type
            Object.keys(rentalData).forEach(cityName => {
                Object.keys(rentalData[cityName]).forEach(year => {
                    const yearData = rentalData[cityName][year];
                    let rentValues;
                    
                    if (selectedHousingType === 'All') {
                        // Average across all housing types
                        rentValues = Object.values(yearData).filter(v => v > 0);
                    } else {
                        // Only use selected housing type
                        if (yearData[selectedHousingType] && yearData[selectedHousingType] > 0) {
                            rentValues = [yearData[selectedHousingType]];
                        } else {
                            rentValues = [];
                        }
                    }
                    
                    if (rentValues.length > 0) {
                        const avgRent = rentValues.reduce((a, b) => a + b, 0) / rentValues.length;
                        cityAverageRents[cityName][year] = avgRent;
                        globalMinRent = Math.min(globalMinRent, avgRent);
                        globalMaxRent = Math.max(globalMaxRent, avgRent);
                    }
                });
            });
            
            // Recreate color scale with new min/max
            rentColorScale = d3.scaleSequential()
                .domain([globalMinRent, globalMaxRent])
                .interpolator(d3.interpolateGreens)
                .unknown('#999');
            
            // Update getCityColor to use new scale
            getCityColor = function(cityName) {
                if (!cityAverageRents[cityName] || !cityAverageRents[cityName][currentYear]) {
                    return '#999'; // gray for no data
                }
                return rentColorScale(cityAverageRents[cityName][currentYear]);
            };
            
            // Refresh legend with the new scale and ranges
            updateLegend();
        };
        
        // Initial calculation with 'All' housing types
        recalculateRentData();
        
        // Update the function to handle city color changes when year changes
        updateCityColors = function() {
            // Get all city circles and update their fill colors and visibility
            const allCircles = gCities.selectAll('circle.city');
            
            const baseRadius = 4;
            const minVisualRadius = 0.3;
            const currentTransform = d3.zoomTransform(svg.node());
            const scaledRadius = Math.max(minVisualRadius, baseRadius / currentTransform.k);
            
            allCircles.each(function(d) {
                const circle = d3.select(this);
                const hasData = cityAverageRents[d.city] && cityAverageRents[d.city][currentYear];
                
                if (hasData) {
                    // City has data for current year - show with color
                    const newColor = selectedCity && d.city === selectedCity.city ? '#2100f7ff' : getCityColor(d.city);
                    circle
                        .transition().duration(300)
                        .style('display', 'block')
                        .style('opacity', 1)
                        .attr('r', scaledRadius)
                        .attr('fill', newColor);
                } else {
                    // City has no data for current year - hide
                    circle
                        .transition().duration(300)
                        .style('opacity', 0)
                        .attr('r', 0)
                        .on('end', function() {
                            d3.select(this).style('display', 'none');
                        });
                }
            });
        };
        
        // Legend was moved earlier in the code - removed duplicate here

        // Use same projection as first visualization
        const projection = d3.geoAlbers()
            .center([0, 58])
            .rotate([96, 0])
            .parallels([49, 77])
            .scale(1300)
            .translate([width / 2, height / 2]);
        const path = d3.geoPath().projection(projection);

        // filter city data
        const cities = rows.map(function(r) {
            return {
                city: r.city || 'Unknown city',
                province: r.province || '',
                id: r.id || '',
                population: r.population && !isNaN(+r.population) ? +r.population : null,
                lat: +r.latitude,
                lon: +r.longitude
            };
            })
            .filter(function(d) { 
                return Number.isFinite(d.lat) && Number.isFinite(d.lon); 
            });

        const cityTransition = 300; // ms for city fade transitions

        // Draw provinces (now interactive - click to zoom)
        const provinceElements = gProvinces.selectAll('path.province')
            .data(provincesGeo.features)
            .join('path')
            .attr('class', 'province')
            .attr('d', path)
            .attr('fill', '#d3d3d3')
            .attr('stroke', '#ffffff')
            .style('stroke-width', 0.8)
            .attr('stroke-linejoin', 'round')
            .attr('stroke-linecap', 'round')
            .style('shape-rendering', 'geometricPrecision')
            .style('pointer-events', 'all')
            .style('cursor', 'pointer')
            .on('click', function(event, d) {
                event.stopPropagation();
                
                // Calculate bounds of the clicked province
                const bounds = path.bounds(d);
                const dx = bounds[1][0] - bounds[0][0];
                const dy = bounds[1][1] - bounds[0][1];
                const x = (bounds[0][0] + bounds[1][0]) / 2;
                const y = (bounds[0][1] + bounds[1][1]) / 2;
                
                // Calculate scale and translate to fit province
                const scale = Math.min(8, 0.9 / Math.max(dx / innerWidth, dy / innerHeight));
                const translate = [innerWidth / 2 - scale * x, innerHeight / 2 - scale * y];
                
                // Animate zoom to province
                svg.transition()
                    .duration(750)
                    .call(
                        zoom.transform,
                        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
                    );
            })
            .on('mouseenter', function(event, d) {
                d3.select(this)
                    .transition()
                    .duration(150)
                    .attr('fill', '#c0c0c0');
                
                // Show province name in tooltip
                tooltip
                    .text(d.properties.name || 'Unknown Province')
                    .style('display', 'block')
                    .style('opacity', 1)
                    .style('left', (event.clientX + 10) + 'px')
                    .style('top', (event.clientY + 10) + 'px');
            })
            .on('mousemove', function(event, d) {
                // Update tooltip position while hovering over province
                tooltip
                    .style('left', (event.clientX + 10) + 'px')
                    .style('top', (event.clientY + 10) + 'px');
            })
            .on('mouseleave', function(event, d) {
                d3.select(this)
                    .transition()
                    .duration(150)
                    .attr('fill', '#d3d3d3');
                
                // Hide tooltip
                tooltip.style('display', 'none').style('opacity', 0).text('');
            });

        
        // Create city circles ONLY for cities that have valid rental data (non-zero prices)
        // Visibility will be controlled by updateCityColors based on current year
        const cityCircles = gCities.selectAll('circle.city')
            .data(cities.filter(d => {
                // Check if city has average rent data (filters out cities with all 0.0 prices)
                return cityAverageRents[d.city] && Object.keys(cityAverageRents[d.city]).length > 0;
            }))
            .join('circle')
            .attr('class', 'city')
            .attr('cx', function(d) { return projection([d.lon, d.lat])[0]; })
            .attr('cy', function(d) { return projection([d.lon, d.lat])[1]; })
            .attr('r', d => {
                // Show only if has data for current year
                return cityAverageRents[d.city] && cityAverageRents[d.city][currentYear] ? 4 : 0;
            })
            .attr('fill', d => getCityColor(d.city))
            .attr('stroke', 'none')
            .attr('stroke-width', 0)
            .style('pointer-events', 'all')
            .style('cursor', 'pointer')
            .style('display', d => {
                // Show only if has data for current year
                return cityAverageRents[d.city] && cityAverageRents[d.city][currentYear] ? 'block' : 'none';
            })
            .style('opacity', d => {
                // Show only if has data for current year
                return cityAverageRents[d.city] && cityAverageRents[d.city][currentYear] ? 1 : 0;
            })
            .on('click', function(event, d) {
                // Prevent event from bubbling to map
                event.stopPropagation();
                
                // If the clicked city is already selected, deselect it
                if (selectedCity && selectedCity.city === d.city) {
                    selectedCity = null;
                    chartContent.style('display', 'none');
                    instructionsDiv.style('display', 'flex');
                        // Hide the close button when switching back to instructions
                        try { closeBtn.style('display', 'none'); } catch (e) {}
                    // Reset all city colors
                    cityCircles.each(function(c) {
                        d3.select(this).attr('fill', getCityColor(c.city));
                    });
                    return;
                }

                // Check if this city has rental data and select it
                if (rentalData[d.city]) {
                    selectedCity = d;
                    updateLineChart(d);

                    // Highlight selected city
                    cityCircles.each(function(c) {
                        if (c === d) {
                            d3.select(this).attr('fill', '#e53e3e');
                        } else {
                            d3.select(this).attr('fill', getCityColor(c.city));
                        }
                    });
                } else {
                    console.log(`No rental data available for ${d.city}`);
                }
            })
            .on('mouseenter', function(event, d) {
                const circle = d3.select(this);
                const originalColor = circle.attr('fill');
                
                // Store original color and change to hover color
                circle.attr('data-original-color', originalColor);
                circle.transition()
                    .duration(150)
                    .attr('fill', '#ff6b35')
                    .attr('r', d => {
                        const currentTransform = d3.zoomTransform(svg.node());
                        const baseRadius = 4;
                        const minVisualRadius = 0.3;
                        const scaledRadius = Math.max(minVisualRadius, baseRadius / currentTransform.k);
                        return scaledRadius * 1.5; // Make it 50% larger on hover
                    });
                
                // Show only city name in tooltip (use clientX/clientY for fixed positioning)
                tooltip
                    .text(d.city)
                    .style('display', 'block')
                    .style('opacity', 1)
                    .style('left', (event.clientX + 10) + 'px')
                    .style('top', (event.clientY + 10) + 'px');
            })
            .on('mousemove', function(event, d) {
                // update tooltip position while hovering (use clientX/clientY for fixed positioning)
                tooltip
                    .style('left', (event.clientX + 10) + 'px')
                    .style('top', (event.clientY + 10) + 'px');
            })
            .on('mouseleave', function(event, d) {
                const circle = d3.select(this);
                const originalColor = circle.attr('data-original-color');
                
                // Only restore color and size if this city is NOT currently selected
                if (!selectedCity || selectedCity.city !== d.city) {
                    circle.transition()
                        .duration(150)
                        .attr('fill', originalColor)
                        .attr('r', d => {
                            const currentTransform = d3.zoomTransform(svg.node());
                            const baseRadius = 4;
                            const minVisualRadius = 0.3;
                            return Math.max(minVisualRadius, baseRadius / currentTransform.k);
                        });
                } else {
                    // Keep selected color but restore size
                    circle.transition()
                        .duration(150)
                        .attr('r', d => {
                            const currentTransform = d3.zoomTransform(svg.node());
                            const baseRadius = 4;
                            const minVisualRadius = 0.3;
                            return Math.max(minVisualRadius, baseRadius / currentTransform.k);
                        });
                }
                
                // Hide tooltip
                tooltip.style('display', 'none').style('opacity', 0).text('');
            });

        const zoom = d3.zoom()
            .scaleExtent([1, 8])
            .translateExtent([[0, 0], [width, height]])
            .on('zoom', function(event) {
                g.attr('transform', event.transform);

                const scale = event.transform.k;
                
                // Scale province stroke width
                gProvinces.selectAll('path.province')
                    .attr('stroke-width', 2 / scale);
                
                // Scale city circles inversely
                const baseRadius = 4;
                const minVisualRadius = 0.3;
                const scaledRadius = Math.max(minVisualRadius, baseRadius / scale);
                gCities.selectAll('circle.city').attr('r', scaledRadius);
            });

        svg.call(zoom);
        
        // Click on empty space to reset zoom and deselect city
        svg.on('click', function(event) {
            // Only reset if clicking directly on SVG (not on provinces or cities)
            if (event.target === this || event.target.tagName === 'svg') {
                svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
                
                // Deselect city and show instructions
                if (selectedCity) {
                    selectedCity = null;
                    chartContent.style('display', 'none');
                    instructionsDiv.style('display', 'flex');
                    // Hide the close button when no city is selected
                    try { closeBtn.style('display', 'none'); } catch (e) {}
                    
                    // Reset all city colors
                    cityCircles.each(function(c) {
                        d3.select(this).attr('fill', getCityColor(c.city));
                    });
                }
            }
        });

        zoomInBtn.on('click', function() {
            svg.transition().duration(300).call(zoom.scaleBy, 1.3);
        });

        zoomOutBtn.on('click', function() {
            svg.transition().duration(300).call(zoom.scaleBy, 0.77);
        });

        resetBtn.on('click', function() {
            svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
        });

    }).catch(function(err) {
        console.error('Failed to load map data:', err);
    });
}
