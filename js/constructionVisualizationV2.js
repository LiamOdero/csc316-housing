class ConstructionVisualization   {
    
    constructor(housingData, populationText)    {
        this.prepData(housingData, populationText)
        this.container = d3.select('#construction-visualization');
        this.currYear = 2023;
        this.ratioMode = false;
    }

    prepData(housingData, populationText)  {
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
            v => d3.sum(v, d => +d.Apartment_and_Other + +d.Singles + +d.Row + +d.Semis || 0),
            d => d.Year,
            d => d.Province
        );
        this.years = Array.from(new Set(housingData.map(d => +d.Year))).filter(y => y >= 2013 && y <= 2023 && y != 2018).sort();
        this.allProvinces = Array.from(new Set(housingData.map(d => d.Province).filter(p => p)));
        // Check what data exists for a specific year
        const year2014Data = housingByProvince.get('2014');
            this.ratioData = [];
            this.allProvinces.forEach(province => {
                this.years.forEach((year, idx) => {
                    if (idx === 0) return;
                    
                    const prevYear = this.years[idx - 1];
                    const completions = housingByProvince.get(String(year))?.get(province) || 0;
                    const currentPop = populationData[province]?.[year] || 0;
                    const prevPop = populationData[province]?.[prevYear] || 0;
                    const popChange = currentPop - prevPop;
                    
                    // (debug logs removed)
                    
                    if (popChange > 0 && completions > 0) {
                        const ratio = completions / popChange;
                        this.ratioData.push({
                            year: year,
                            province: province,
                            ratio: ratio,
                            completions: completions,
                            popChange: popChange,
                            peoplePerUnit: Math.round(1 / ratio)
                        });
                    } else if (idx === 1 && province === this.allProvinces[0]) {
                        // skip empty points
                    }
                });
            });
    }

    initVis()   {
        let vis = this;
        vis.margin = { top: 60, right: 180, bottom: 60, left: 80 };
        vis.width = document.getElementById("construction-visualization").getBoundingClientRect().width - vis.margin.left - vis.margin.right;
		vis.height = document.getElementById("construction-visualization").getBoundingClientRect().height - vis.margin.top - vis.margin.bottom;

        vis.svg = this.container.append('svg')
            .attr('width', vis.width + vis.margin.left + vis.margin.right)
            .attr('height', vis.height + vis.margin.top + vis.margin.bottom)
            .append('g')
            .attr('transform', `translate(${vis.margin.left},${vis.margin.top})`);

        vis.tooltip = d3.select('body').append('div')
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

        // Create color scale for provinces
        vis.colorScale = d3.scaleOrdinal()
            .domain(this.allProvinces)
            .range(d3.schemeCategory10);
        
        vis.filterContainer = this.container.insert('div', ':first-child')
            .attr('class', 'construction-filters')
            .style('margin-bottom', '20px')
            .style('display', 'flex')
            .style('gap', '20px')
            .style('align-items', 'center')
            .style('justify-content', 'center');;

        const makeCard = () => vis.filterContainer.append('div')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('gap', '8px')
        .style('padding', '8px 10px')
        .style('border', '1px solid #d1d5db')
        .style('border-radius', '10px')
        .style('background', '#ffffff');

        // Year controls
        const yearCard = makeCard();
        // Play/pause + reset
        let playTimer = null;
        vis.playing  = false;
        let currentYear = vis.currYear;
        vis.stopPlayback = () => {
            if (playTimer) {
                clearInterval(playTimer);
                playTimer = null;
            }
            vis.playing = false;
            playBtn.text('▶ Play');
        };
        const stepPlayback = () => {
            if (!vis.years.length) {
                vis.stopPlayback();
                return;
            }
            const idx = vis.years.indexOf(currentYear);
            const nextIdx = (idx === vis.years.length - 1) ? 1 : idx + 1;
            let nextYear = vis.years[nextIdx];

            if (nextYear == 2018)   {
                nextYear = 2019
            }
            currentYear = nextYear;
            yearSlider.property('value', nextYear);
            yearDisplay.text(nextYear);

            vis.currYear = nextYear;
            vis.wrangleData();
        };
        const buttonBase = sel => sel
            .style('display', 'inline-flex')
            .style('align-items', 'center')
            .style('gap', '4px')
            .style('padding', '6px 10px')
            .style('border', '1px solid #d1d5db')
            .style('border-radius', '8px')
            .style('background', '#f4f4f5')
            .style('color', '#1f2937')
            .style('font-weight', '600')
            .style('min-height', '32px')
            .style('min-width', '90px')
            .style('white-space', 'nowrap')
            .style('cursor', 'pointer');
        const playBtn = buttonBase(yearCard.append('button')
            .attr('type', 'button')
            .text('▶ Play')
            .on('click', () => {
                if (vis.playing) {
                    vis.stopPlayback();
                } else {
                    vis.playing = true;
                    playBtn.text('❚❚ Pause');
                    playTimer = setInterval(stepPlayback, 1000);
                }
            }));
        buttonBase(yearCard.append('button')
            .attr('type', 'button')
            .text('↺ Reset')
            .on('click', () => {
                vis.stopPlayback();
                const minYear = 2015;
                currentYear = minYear;
                yearSlider.property('value', minYear);
                yearDisplay.text(minYear);
                vis.currYear = minYear;
            vis.wrangleData();
            }));
        // Year label and slider
        yearCard.append('span')
            .style('font-weight', '600')
            .style('color', '#4b5563')
            .text('Year:');
        const yearDisplay = yearCard.append('span')
            .attr('id', 'vis4v2-year-display')
            .style('font-weight', '700')
            .style('color', '#111827')
            .text(vis.currYear);
        yearCard.append('span')
            .style('color', '#9ca3af')
            .style('font-size', '0.85rem')
            .text(2015 || '');
        const yearSlider = yearCard.append('input')
            .attr('type', 'range')
            .attr('min', 2015)
            .attr('max', vis.years[vis.years.length - 1] || 2023)
            .attr('step', 1)
            .attr('value', vis.currYear)
            .style('min-width', '180px')
            .style('margin', '0 4px')
            .style('align-self', 'center')
            .on('input', event => {
                let value = Number(event.target.value);
                let effectiveYear = value;
                
                if (!Number.isFinite(value)) return;

                if (value === 2018) {
                    effectiveYear = (vis.currYear === 2019) ? 2017 : 2019;
                }

                yearSlider.property("value", effectiveYear);
                yearDisplay.text(effectiveYear);

                vis.currYear = effectiveYear;
                vis.wrangleData();
                currentYear = effectiveYear; 

                vis.stopPlayback();
            })
        yearCard.append('span')
            .style('color', '#9ca3af')
            .style('font-size', '0.85rem')
            .text(vis.years[vis.years.length - 1] || '');

        vis.sort = "completions"
        // Family controls
        const familyCard = makeCard();
        familyCard.append('span')
            .style('font-weight', '600')
            .style('color', '#4b5563')
            .text('Visualize:');
        const familyOrder = ['Completions vs Population Change', "Completion : Population Change Ratio"];
        const familyButtons = familyCard.append('div')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('gap', '8px')
            .style('flex-wrap', 'nowrap')
            .selectAll('button')
            .data(familyOrder)
            .enter()
            .append('button')
            .attr('type', 'button')
            .style('padding', '6px 10px')
            .style('border', '1px solid #d1d5db')
            .style('border-radius', '8px')
            .style('background', d => d === "Completions vs Population Change" ? '#e0f2fe' : '#f4f4f5')
            .style('color', '#1f2937')
            .style('font-weight', '600')
            .style('min-height', '32px')
            .style('display', 'inline-flex')
            .style('align-items', 'center')
            .style('gap', '4px')
            .style('white-space', 'nowrap')
            .style('cursor', 'pointer')
            .text(d => d)
            .on('click', (_, d) => {
                let wasPlaying = false;
                if (this.playing)   {
                    vis.stopPlayback();
                    wasPlaying = true;
                }
                
                familyButtons
                    .style('background', btn => btn === d ? '#e0f2fe' : '#f4f4f5')
                    .style('border-color', btn => btn === d ? '#60a5fa' : '#d1d5db');

                if (d === "Completions vs Population Change")   {
                    vis.ratioMode = false;
                    vis.sort = "completions"

                    vis.constructionText.text("Housing Completions by Province")
                    vis.populationText.text("Population Increase by Province")
                }   else    {
                    vis.ratioMode = true;
                    vis.sort = "ratio"

                    vis.constructionText.text("1 Completion")
                    vis.populationText.text("People per Completion")
                }

                vis.wrangleData();
                if (wasPlaying) {
                    vis.playing = true;
                    playBtn.text('❚❚ Pause');
                    playTimer = setInterval(stepPlayback, 1000);
                }
            });


        vis.constructionScale = d3.scaleLinear()
            .range([vis.width / 2 - 100, 0]);

        vis.completionRatioScale = d3.scaleLinear()
            .range([vis.width / 2 - 100, 0])
            .domain([1, 0])

        vis.popScale = d3.scaleLinear()
            .range([0, vis.width / 2 - 100]);
        
        vis.popRatioScale = d3.scaleLinear()
            .range([0, vis.width / 2 - 100])

        vis.yScale = d3.scaleBand()
            .domain(vis.allProvinces)
            .range([0, vis.height])
            
        vis.constructionAxis = d3.axisTop(vis.constructionScale)
            .tickFormat(d3.format('d'))
            .ticks(10)

        vis.completionRatioAxis = d3.axisTop(vis.completionRatioScale)
            .tickFormat(d3.format('d'))
            .ticks(0)

        vis.popAxis = d3.axisTop(vis.popScale)
            .tickFormat(d3.format('d'))
            .ticks(10)

        vis.popRatioAxis = d3.axisTop(vis.popRatioScale)
            .tickFormat(d3.format('d'))
        
        vis.yAxis = d3.axisLeft(vis.yScale)

        vis.svg.append('g')
            .attr('class', 'x-axis1')
            .attr('transform', `translate(${50},0)`)
            .selectAll('text')
            .style('font-size', '12px');

        vis.svg.append('g')
            .attr('class', 'x-axis2')
            .attr('transform', `translate(${vis.width / 2 + 150},0)`)
            .selectAll('text')
            .style('font-size', '12px');

        vis.yAxisGroup = vis.svg.append('g')
                    .attr('class', 'y-axis')
                    .attr('transform', `translate(${vis.width / 2 + 60},0)`)
                    .call(vis.yAxis); // <-- Call axis generator here
                    
                vis.yAxisGroup.select('.domain').attr('stroke', 'none');
                vis.yAxisGroup.selectAll('.tick line').attr('stroke', 'none');

        vis.yAxisGroup.selectAll('text')
            .style('font-size', '20px')
            .attr("text-anchor", "middle")

        vis.svg.append('text')
            .attr('class', 'y-axis-label')
            .attr('transform', 'rotate(-90)')
            .attr('x', -vis.height / 2)
            .attr('y', -60)
            .attr('text-anchor', 'middle')
            .style('font-size', '14px')
            .style('font-weight', 'bold')

        vis.constructionText = vis.svg.append('text')
            .attr('class', 'chart-title')
            .attr('x', vis.width / 4)
            .attr('y', -30)
            .attr('text-anchor', 'middle')
            .style('font-size', '18px')
            .style('font-weight', 'bold')
            .text('Housing Completions by Province');

        vis.populationText = vis.svg.append('text')
            .attr('class', 'chart-title')
            .attr('x', vis.width / 4 * 3 + 100)
            .attr('y', -30)
            .attr('text-anchor', 'middle')
            .style('font-size', '18px')
            .style('font-weight', 'bold')
            .text('Population Increase by Province');

        this.wrangleData();
    }

    destructVis()   {
        let vis = this;
        d3.select("#construction-visualization").selectAll("*").remove();
        vis.stopPlayback();
        vis.ratioMode = false;
    }

    wrangleData()   {
        let vis = this;
        this.displayData = this.ratioData.filter((d)    =>  {
            return d.year == vis.currYear; 
        })

        this.displayData.sort((a, b) =>   {
            if (vis.sort === "ratio")   {
                return a[vis.sort] - b[vis.sort];
            }   else    {
                return b[vis.sort] - a[vis.sort];
            }
            
        })
        this.updateVis();
    }

    updateVis() {
        let vis = this;
        const maxPopChange = d3.max(vis.ratioData, d => d.popChange);
        vis.constructionScale.domain([0, maxPopChange]);
        vis.popScale.domain([0, maxPopChange]);
        vis.popRatioScale.domain([0, d3.max(vis.displayData, d => d.peoplePerUnit)])
        let currentProvinces = vis.displayData.map(d => d.province);
        vis.yScale.domain(currentProvinces)

        if (this.ratioMode) {
            // theres some bug with some rectangles remaining, this seems to be the only way to fix it
            vis.svg.selectAll(".construction-rect").remove();
        }

        vis.constructionGroup = vis.svg.selectAll(".construction-rect")
           .data(vis.displayData)
        

        vis.popRatioAxis.ticks(vis.popRatioScale.domain()[1])

        vis.currConstructionAxis = (vis.ratioMode) ? vis.completionRatioAxis : vis.constructionAxis;
        vis.currPopAxis = (vis.ratioMode) ? vis.popRatioAxis : vis.popAxis;

        vis.constructionGroup.enter().append("rect")
                                     .attr("class", "construction-rect")
                                    .on('mouseover', function(event, d) {
                                        if (!vis.playing)   {
                                            d3.select(this)
                                                .transition()
                                                .duration(150)
                                                .attr('r', 6)
                                                .attr('stroke', '#000')
                                                .attr('stroke-width', 2);

                                            vis.tooltip
                                                .style('visibility', 'visible')
                                                .style('top', (event.pageY - 10) + 'px')
                                                .style('left', (event.pageX + 15) + 'px')
                                                .html(`
                                                    <strong>${d.province}</strong><br/>
                                                    Completions: ${d.completions.toLocaleString()}<br/>
                                                    Pop. Change: ${d.popChange.toLocaleString()}<br/>
                                                    Completion : Population Ratio: ${1 + " : " + Math.round(1 / d.ratio)}
                                                `);
                                        }

                                    })
                                    .on('mousemove', function(event) {
                                        if (!vis.playing)   {
                                            vis.tooltip
                                                .style('top', (event.pageY - 10) + 'px')
                                                .style('left', (event.pageX + 15) + 'px');
                                        }

                                    })
                                    .on('mouseout', function() {
                                        if (!vis.playing)   {
                                            d3.select(this)
                                                .transition()
                                                .duration(150)
                                                .attr('r', 4)
                                                .attr('stroke', 'none');

                                            vis.tooltip.style('visibility', 'hidden');
                                        }

                                    })
                                     .merge(vis.constructionGroup)
                                     .transition()
                                     .duration(350) 
                                     .attr("x", d => {
                                        const barLength = vis.popScale(d.completions);
                                        const centerLine = vis.width / 2 - 50;
                                        return centerLine - barLength;
                                        })
                                     .attr("y", d => vis.yScale(d.province) + 5) 
                                     .attr("width", d => (vis.ratioMode) ? 0 :  vis.popScale(d.completions)) 
                                     .attr("height", vis.yScale.bandwidth() - 4) 
                                     .attr("fill", "steelblue")
                                     .attr("opacity", 1 - 0.75 * vis.ratioMode);

        vis.popGroup = vis.svg.selectAll("popGroup")
           .data(vis.ratioData)

        vis.popGroup = vis.svg.selectAll(".pop-rect") 
        .data(vis.displayData, d => d.province); // Use displayData

        vis.popGroup.enter().append("rect")
            .attr("class", "pop-rect")
            .on('mouseover', function(event, d) {
                if (!vis.playing)   {
                    d3.select(this)
                    .transition()
                    .duration(150)
                    .attr('r', 6)
                    .attr('stroke', '#000')
                    .attr('stroke-width', 2);

                    vis.tooltip
                    .style('visibility', 'visible')
                    .style('top', (event.pageY - 10) + 'px')
                    .style('left', (event.pageX + 15) + 'px')
                    .html(`
                        <strong>${d.province}</strong><br/>
                        Completions: ${d.completions.toLocaleString()}<br/>
                        Pop. Change: ${d.popChange.toLocaleString()}<br/>
                        Completion : Population Ratio: ${1 + " : " + Math.round(1 / d.ratio)}
                    `);
                }

                })
                .on('mousemove', function(event) {
                    if (!vis.playing)   {
                        vis.tooltip
                            .style('top', (event.pageY - 10) + 'px')
                            .style('left', (event.pageX + 15) + 'px');
                    }

                })
                .on('mouseout', function() {
                    if (!vis.playing)   {
                        d3.select(this)
                            .transition()
                            .duration(150)
                            .attr('r', 4)
                            .attr('stroke', 'none');

                        vis.tooltip.style('visibility', 'hidden');
                    }
                })
            .merge(vis.popGroup)
            .transition()
            .duration(350) 
            .attr("x", vis.width / 2 + 150) // Start position to the right of the Y-Axis labels
            .attr("y", d => vis.yScale(d.province) + 5)
            .attr("width", d => (vis.ratioMode) ? vis.popRatioScale(d.peoplePerUnit) :  vis.popScale(d.popChange)) // Width is simply the scaled value
            .attr("height", vis.yScale.bandwidth() - 4)
            .attr("fill", "salmon")
            .attr("opacity", 1 - 0.75 * vis.ratioMode);
            
        // Exit
        vis.popGroup.exit().remove();

    const centerLineX = vis.width / 2 + 105; // Center X position where Y-axis labels siattr('stroke', 'none');

        const ratioGroup = vis.svg.selectAll(".ratio-group")
            .data(vis.displayData, d => d.province);

        // Exit
        ratioGroup.exit()
            .transition().duration(350).attr("opacity", 0).remove();

        // Enter
        const ratioGroupEnter = ratioGroup.enter().append("g")
            .attr("class", "ratio-group")
            .attr("opacity", 0); 

        // Merge and Transition
        const ratioGroupUpdate = ratioGroupEnter.merge(ratioGroup)
            .transition()
            .duration(350)
            .attr("transform", d => `translate(0, ${vis.yScale(d.province) + vis.yScale.bandwidth() / 2})`)
            .attr("opacity", 1); 

        // Remove old ratio elements before re-adding, ensuring clean update
        ratioGroupUpdate.each(function() {
            d3.select(this).selectAll(".ratio-element").remove();
        });

        // Re-add ratio elements
        ratioGroupUpdate.each(function(d) {
            const group = d3.select(this);
            
            // --- A. House Icon (Left Side of Ratio) ---
            group.append("text")
                .attr("class", "ratio-element house-icon")
                .attr("x", d => {
                    const barLength = vis.popScale(d.completions);
                    const centerLine = vis.width / 2 - 50;
                    return centerLine;
                })
                .attr("y", 5) // Center vertically within the band
                .style("text-anchor", "end")
                .style("font-size", 18 * vis.ratioMode + "px")
                .style("font-weight", "bold")
                .text("🏠")
                .attr("fill", "#059669")
                .style("pointer-events", "none"); 

            // --- B. Stick Figures (Right Side of Ratio) ---
            const peoplePerUnit = Math.ceil(d.peoplePerUnit);
            const startX = vis.width / 2 + 105; // Start position slightly right of center line
            const spacing = 16; // Horizontal spacing between figures
            const maxDisplayedFigures = 30; // Limit the number of icons shown for clarity
            const figuresToDisplay = Math.min(peoplePerUnit, maxDisplayedFigures);

            for (let i = 0; i < figuresToDisplay; i++) {
                group.append("text")
                    .attr("class", "ratio-element stick-figure")
                    .attr("x", d => vis.width / 2 + 145 + vis.popRatioScale(i))
                    .attr("y", 5)
                    .style("text-anchor", "start")
                    .style("font-size", 18 * vis.ratioMode + "px")
                    .style("font-weight", "bold")
                    .text("🧍")
                    .attr("fill", "#dc2626")
                    .style("pointer-events", "none");
            }
        });

        vis.svg.select(".x-axis1").call(vis.currConstructionAxis);
        vis.svg.select(".x-axis2").call(vis.currPopAxis);

        const t = vis.svg.select(".y-axis").transition().duration(750);
        t.call(vis.yAxis)
                .transition()
                .duration(350)
                .select('.domain')
                .attr('stroke', 'none');
        
        vis.svg.select(".y-axis")
                .selectAll('.tick line') // Selects the small lines that make up the ticks
                .attr('stroke', 'none');
        vis.yAxisGroup.selectAll('text')
            .style('font-size', '14px')
            .attr("text-anchor", "middle")
    }
}