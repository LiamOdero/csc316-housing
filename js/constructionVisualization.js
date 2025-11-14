function initConstructionVisualization() {
    const container = d3.select('#construction-visualization');
    if (container.empty()) {
        console.error('Construction visualization container #construction-visualization not found');
        return;
    }
    
    // Check if visualization already exists
    if (!container.select('svg').empty()) {
        console.log('Construction visualization already initialized');
        return;
    }

    const margin = { top: 60, right: 180, bottom: 60, left: 80 };
    const width = 1100 - margin.left - margin.right;
    const height = 600 - margin.top - margin.bottom;

    const svg = container.append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    const tooltip = d3.select('body').append('div')
        .attr('class', 'construction-tooltip')
        .style('position', 'absolute')
        .style('visibility', 'hidden')
        .style('background-color', 'rgba(0, 0, 0, 0.8)')
        .style('color', 'white')
        .style('padding', '8px 12px')
        .style('border-radius', '4px')
        .style('font-size', '12px')
        .style('pointer-events', 'none')
        .style('z-index', '1000');

    Promise.all([
        d3.csv('data/construction/housing_completions_dwelling_type_by_province_2013-2023.csv'),
        d3.text('data/construction/canadian-population.csv')
    ]).then(([housingData, populationText]) => {
        
    const populationLines = populationText.split('\n');
        
        // Find the header line with province names (line 9, index 8)
        const geoHeaderLine = populationLines[8];
        // Parse CSV considering quoted fields
        const parseCSVLine = (line) => {
            const result = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            result.push(current.trim());
            return result;
        };
        
        const geoHeaders = parseCSVLine(geoHeaderLine);
        const allAgesLine = populationLines[12]; // "All ages" row
        const allAgesValues = parseCSVLine(allAgesLine);
        
        // Extract province names (skip first column "Geography" and filter out empty strings)
    const provinceNames = geoHeaders.slice(1).filter(name => name && name !== '');
        
        const populationData = {};
        
        // Each province has 11 years of data (2013-2023)
        provinceNames.forEach((provinceName, provinceIdx) => {
            const cleanProvince = provinceName.trim();
            populationData[cleanProvince] = {};
            
            // Calculate the starting column for this province's data
            // First column is row label, then each province has 11 year columns
            const startCol = 1 + (provinceIdx * 11);
            
            for (let yearOffset = 0; yearOffset < 11; yearOffset++) {
                const year = 2013 + yearOffset;
                const colIdx = startCol + yearOffset;
                const value = allAgesValues[colIdx];
                
                if (value && value !== '..t') {
                    // Remove quotes and commas from numbers
                    const cleanValue = value.replace(/"/g, '').replace(/,/g, '');
                    const popValue = parseInt(cleanValue);
                    if (!isNaN(popValue)) {
                        populationData[cleanProvince][year] = popValue;
                    }
                }
            }
        });

        

        // Housing data is already aggregated by province in the new CSV
        const housingByProvince = d3.rollup(
            housingData.filter(d => {
                const year = +d.Year;
                return year >= 2013 && year <= 2023 && d.Province && d.Total;
            }),
            v => d3.sum(v, d => +d.Total || 0),
            d => d.Year,
            d => d.Province
        );

        const years = Array.from(new Set(housingData.map(d => +d.Year))).filter(y => y >= 2013 && y <= 2023).sort();
        const allProvinces = Array.from(new Set(housingData.map(d => d.Province).filter(p => p)));
        
        // Create color scale for provinces
        const colorScale = d3.scaleOrdinal()
            .domain(allProvinces)
            .range(d3.schemeCategory10);
        
        
    // Check what data exists for a specific year
    const year2014Data = housingByProvince.get('2014');
        const ratioData = [];

        allProvinces.forEach(province => {
            years.forEach((year, idx) => {
                if (idx === 0) return;
                
                const prevYear = years[idx - 1];
                const completions = housingByProvince.get(String(year))?.get(province) || 0;
                const currentPop = populationData[province]?.[year] || 0;
                const prevPop = populationData[province]?.[prevYear] || 0;
                const popChange = currentPop - prevPop;
                
                // (debug logs removed)
                
                if (popChange > 0 && completions > 0) {
                    const ratio = completions / popChange;
                    ratioData.push({
                        year: year,
                        province: province,
                        ratio: ratio,
                        completions: completions,
                        popChange: popChange
                    });
                } else if (idx === 1 && province === allProvinces[0]) {
                    // skip empty points
                }
            });
        });
        

        let selectedProvinces = new Set(allProvinces);
        let selectedHousingTypes = new Set(['All']);

        const filterContainer = container.insert('div', ':first-child')
            .attr('class', 'construction-filters')
            .style('margin-bottom', '20px')
            .style('display', 'flex')
            .style('gap', '20px')
            .style('align-items', 'flex-start');

        // Province filter with custom dropdown
        const provinceFilter = filterContainer.append('div')
            .style('flex', '1')
            .style('position', 'relative');
        
        provinceFilter.append('label')
            .style('display', 'block')
            .style('font-weight', 'bold')
            .style('margin-bottom', '8px')
            .text('Select Provinces:');

        // Custom dropdown button
        const dropdownButton = provinceFilter.append('button')
            .attr('id', 'province-dropdown-button')
            .style('width', '100%')
            .style('padding', '8px 12px')
            .style('min-height', '36px')
            .style('border', '1px solid #ccc')
            .style('border-radius', '4px')
            .style('background-color', 'white')
            .style('cursor', 'pointer')
            .style('text-align', 'left')
            .style('display', 'flex')
            .style('justify-content', 'space-between')
            .style('align-items', 'center');

        dropdownButton.append('span')
            .attr('class', 'button-text')
            .text('All Provinces Selected');

        dropdownButton.append('span')
            .attr('class', 'arrow')
            .style('margin-left', 'auto')
            .html('▼');

        // Dropdown menu with checkboxes
        const dropdownMenu = provinceFilter.append('div')
            .attr('id', 'province-dropdown-menu')
            .style('position', 'absolute')
            .style('top', '100%')
            .style('left', '0')
            .style('width', '100%')
            .style('max-height', '300px')
            .style('overflow-y', 'auto')
            .style('background-color', 'white')
            .style('border', '1px solid #ccc')
            .style('border-radius', '4px')
            .style('box-shadow', '0 4px 6px rgba(0,0,0,0.1)')
            .style('z-index', '1000')
            .style('display', 'none')
            .style('margin-top', '4px');

        allProvinces.forEach(province => {
            const checkboxItem = dropdownMenu.append('div')
                .attr('class', 'checkbox-item')
                .style('padding', '8px 12px')
                .style('cursor', 'pointer')
                .style('display', 'flex')
                .style('align-items', 'center')
                .style('gap', '8px')
                .on('click', function(event) {
                    event.stopPropagation(); // Prevent dropdown from closing
                })
                .on('mouseover', function() {
                    d3.select(this).style('background-color', '#f0f0f0');
                })
                .on('mouseout', function() {
                    d3.select(this).style('background-color', 'white');
                });

            const checkbox = checkboxItem.append('input')
                .attr('type', 'checkbox')
                .attr('id', `province-${province}`)
                .attr('value', province)
                .property('checked', true)
                .on('change', function() {
                    if (this.checked) {
                        selectedProvinces.add(province);
                    } else {
                        selectedProvinces.delete(province);
                    }
                    updateDropdownButtonText();
                    updateChart();
                });

            checkboxItem.append('label')
                .attr('for', `province-${province}`)
                .style('cursor', 'pointer')
                .style('flex', '1')
                .style('user-select', 'none')
                .text(province);
        });

        // Toggle dropdown visibility
        dropdownButton.on('click', function(event) {
            event.stopPropagation();
            const menu = d3.select('#province-dropdown-menu');
            const isVisible = menu.style('display') === 'block';
            menu.style('display', isVisible ? 'none' : 'block');
        });

        // Close dropdown when clicking outside
        d3.select('body').on('click.province-dropdown', function(event) {
            const menu = d3.select('#province-dropdown-menu');
            if (menu.style('display') === 'block') {
                menu.style('display', 'none');
            }
        });

        function updateDropdownButtonText() {
            const count = selectedProvinces.size;
            const total = allProvinces.length;
            const buttonText = d3.select('#province-dropdown-button .button-text');
            if (count === total) {
                buttonText.text('All Provinces Selected');
            } else if (count === 0) {
                buttonText.text('No Provinces Selected');
            } else {
                buttonText.text(`${count} of ${total} Provinces Selected`);
            }
        }

        const housingTypeFilter = filterContainer.append('div')
            .style('flex', '1');
        
        housingTypeFilter.append('label')
            .style('display', 'block')
            .style('font-weight', 'bold')
            .style('margin-bottom', '8px')
            .text('Housing Type:');

        const housingTypes = ['All', 'Singles', 'Semis', 'Row', 'Apartment_and_Other'];
        const housingTypeSelect = housingTypeFilter.append('select')
            .attr('id', 'housing-type-select')
            .style('width', '100%')
            .style('padding', '8px 12px')
            .style('min-height', '36px')
            .style('border', '1px solid #ccc')
            .style('border-radius', '4px');

        housingTypes.forEach(type => {
            housingTypeSelect.append('option')
                .attr('value', type)
                .text(type.replace(/_/g, ' '));
        });

        d3.select('#housing-type-select').on('change', function() {
            const selectedType = this.value;
            selectedHousingTypes = new Set([selectedType]);
            
            if (selectedType !== 'All') {
                // Rebuild housing data with the selected type
                const housingByProvinceFiltered = d3.rollup(
                    housingData.filter(d => {
                        const year = +d.Year;
                        return year >= 2013 && year <= 2023 && d.Province && d[selectedType];
                    }),
                    v => d3.sum(v, d => +d[selectedType] || 0),
                    d => d.Year,
                    d => d.Province
                );

                ratioData.length = 0;
                allProvinces.forEach(province => {
                    years.forEach((year, idx) => {
                        if (idx === 0) return;
                        
                        const prevYear = years[idx - 1];
                        const completions = housingByProvinceFiltered.get(String(year))?.get(province) || 0;
                        const currentPop = populationData[province]?.[year] || 0;
                        const prevPop = populationData[province]?.[prevYear] || 0;
                        const popChange = currentPop - prevPop;
                        
                        if (popChange > 0 && completions > 0) {
                            const ratio = completions / popChange;
                            ratioData.push({
                                year: year,
                                province: province,
                                ratio: ratio,
                                completions: completions,
                                popChange: popChange
                            });
                        }
                    });
                });
            } else {
                // Use total housing completions
                ratioData.length = 0;
                allProvinces.forEach(province => {
                    years.forEach((year, idx) => {
                        if (idx === 0) return;
                        
                        const prevYear = years[idx - 1];
                        const completions = housingByProvince.get(String(year))?.get(province) || 0;
                        const currentPop = populationData[province]?.[year] || 0;
                        const prevPop = populationData[province]?.[prevYear] || 0;
                        const popChange = currentPop - prevPop;
                        
                        if (popChange > 0 && completions > 0) {
                            const ratio = completions / popChange;
                            ratioData.push({
                                year: year,
                                province: province,
                                ratio: ratio,
                                completions: completions,
                                popChange: popChange
                            });
                        }
                    });
                });
            }
            
            updateChart();
        });

        const xScale = d3.scaleLinear()
            .domain([d3.min(years.slice(1)), d3.max(years)])
            .range([0, width]);

        const yScale = d3.scaleLinear()
            .domain([0, d3.max(ratioData, d => d.ratio) * 1.1])
            .range([height, 0]);

        const xAxis = d3.axisBottom(xScale)
            .tickFormat(d3.format('d'))
            .ticks(years.length - 1);
        
        const yAxis = d3.axisLeft(yScale)
            .ticks(10);

        svg.append('g')
            .attr('class', 'x-axis')
            .attr('transform', `translate(0,${height})`)
            .call(xAxis)
            .selectAll('text')
            .style('font-size', '12px');

        svg.append('g')
            .attr('class', 'y-axis')
            .call(yAxis)
            .selectAll('text')
            .style('font-size', '12px');

        svg.append('text')
            .attr('class', 'x-axis-label')
            .attr('x', width / 2)
            .attr('y', height + 45)
            .attr('text-anchor', 'middle')
            .style('font-size', '14px')
            .style('font-weight', 'bold')
            .text('Year');

        svg.append('text')
            .attr('class', 'y-axis-label')
            .attr('transform', 'rotate(-90)')
            .attr('x', -height / 2)
            .attr('y', -60)
            .attr('text-anchor', 'middle')
            .style('font-size', '14px')
            .style('font-weight', 'bold')
            .text('Completed Housing Units per New Person');

        svg.append('text')
            .attr('class', 'chart-title')
            .attr('x', width / 2)
            .attr('y', -30)
            .attr('text-anchor', 'middle')
            .style('font-size', '18px')
            .style('font-weight', 'bold')
            .text('Housing Completions per New Person by Province');

        const linesGroup = svg.append('g').attr('class', 'lines-group');
        const pointsGroup = svg.append('g').attr('class', 'points-group');

        // Create legend on the right side of the chart
        const legend = svg.append('g')
            .attr('class', 'legend')
            .attr('transform', `translate(${width + 20}, 0)`);

        legend.append('text')
            .attr('x', 0)
            .attr('y', -10)
            .style('font-size', '14px')
            .style('font-weight', 'bold')
            .text('Provinces');

        function updateChart() {
            const filteredData = ratioData.filter(d => selectedProvinces.has(d.province));
            const provinceGroups = d3.group(filteredData, d => d.province);

            yScale.domain([0, d3.max(filteredData, d => d.ratio) * 1.1 || 1]);
            svg.select('.y-axis').transition().duration(500).call(yAxis);

            const line = d3.line()
                .x(d => xScale(d.year))
                .y(d => yScale(d.ratio))
                .curve(d3.curveMonotoneX);

            const lines = linesGroup.selectAll('.province-line')
                .data(Array.from(provinceGroups), d => d[0]);

            lines.exit()
                .transition()
                .duration(300)
                .style('opacity', 0)
                .remove();

            const linesEnter = lines.enter()
                .append('path')
                .attr('class', 'province-line')
                .attr('fill', 'none')
                .attr('stroke', d => colorScale(d[0]))
                .attr('stroke-width', 2)
                .style('opacity', 0);

            linesEnter.merge(lines)
                .transition()
                .duration(500)
                .style('opacity', 1)
                .attr('d', d => line(d[1]))
                .attr('stroke', d => colorScale(d[0]));

            const points = pointsGroup.selectAll('.data-point')
                .data(filteredData, d => `${d.province}-${d.year}`);

            points.exit()
                .transition()
                .duration(300)
                .attr('r', 0)
                .remove();

            const pointsEnter = points.enter()
                .append('circle')
                .attr('class', 'data-point')
                .attr('cx', d => xScale(d.year))
                .attr('cy', d => yScale(d.ratio))
                .attr('r', 0)
                .attr('fill', d => colorScale(d.province))
                .style('cursor', 'pointer');

            pointsEnter.merge(points)
                .on('mouseover', function(event, d) {
                    d3.select(this)
                        .transition()
                        .duration(150)
                        .attr('r', 6)
                        .attr('stroke', '#000')
                        .attr('stroke-width', 2);

                    tooltip
                        .style('visibility', 'visible')
                        .style('top', (event.pageY - 10) + 'px')
                        .style('left', (event.pageX + 15) + 'px')
                        .html(`
                            <strong>${d.province}</strong><br/>
                            Year: ${d.year}<br/>
                            Ratio: ${d.ratio.toFixed(3)}<br/>
                            Completions: ${d.completions.toLocaleString()}<br/>
                            Pop. Change: ${d.popChange.toLocaleString()}
                        `);
                })
                .on('mousemove', function(event) {
                    tooltip
                        .style('top', (event.pageY - 10) + 'px')
                        .style('left', (event.pageX + 15) + 'px');
                })
                .on('mouseout', function() {
                    d3.select(this)
                        .transition()
                        .duration(150)
                        .attr('r', 4)
                        .attr('stroke', 'none');

                    tooltip.style('visibility', 'hidden');
                })
                .transition()
                .duration(500)
                .attr('cx', d => xScale(d.year))
                .attr('cy', d => yScale(d.ratio))
                .attr('r', 4);

            // Update legend on the right side
            const legendItems = legend.selectAll('.legend-item')
                .data(allProvinces.sort(), d => d);

            legendItems.exit().remove();

            const legendEnter = legendItems.enter()
                .append('g')
                .attr('class', 'legend-item')
                .attr('transform', (d, i) => `translate(0, ${i * 25})`);

            legendEnter.append('rect')
                .attr('width', 18)
                .attr('height', 18)
                .attr('rx', 3);

            legendEnter.append('text')
                .attr('x', 24)
                .attr('y', 9)
                .attr('dy', '0.35em')
                .style('font-size', '12px')
                .style('text-anchor', 'start');

            const allLegendItems = legendEnter.merge(legendItems);
            
            allLegendItems
                .attr('transform', (d, i) => `translate(0, ${i * 25})`);

            allLegendItems.select('rect')
                .attr('fill', d => colorScale(d))
                .attr('opacity', d => selectedProvinces.has(d) ? 1 : 0.3);

            allLegendItems.select('text')
                .text(d => d)
                .attr('opacity', d => selectedProvinces.has(d) ? 1 : 0.5);
        }

        updateChart();

    }).catch(error => {
        console.error('Error loading construction data:', error);
        container.append('p')
            .style('color', 'red')
            .text('Error loading construction data. Please check the console for details.');
    });
}
