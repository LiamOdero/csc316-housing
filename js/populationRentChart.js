
/*
 * PopulationRentChart - ES6 Class
 * @param  parentElement 	-- the HTML element in which to draw the visualization
 * @param  data             -- the data the that's provided initially
 * @param  displayData      -- the data that will be used finally (which might vary based on the selection)
 *
 * @param  focus            -- a switch that indicates the current mode (focus or stacked overview)
 * @param  selectedIndex    -- a global 'variable' inside the class that keeps track of the index of the selected area
 */

class PopulationRentChart {

// constructor method to initialize PopulationRentChart object
constructor(parentElement, filterElements, data) {
    this.parentElement = parentElement;

    // sorting the data to make accumulation logic simpler
    this.data = data.sort(function(a, b)    {
        return a.year - b.year || a.province.localeCompare(b.province)
    })

    this.displayData = [];

    let colors = ['#a6cee3','#1f78b4','#b2df8a','#33a02c','#fb9a99','#e31a1c','#fdbf6f','#ff7f00','#cab2d6','#6a3d9a'];

    this.provinces = [...new Set(data.map(item => item.province))];
    this.displayCategories = this.provinces;
    this.provinceMode = true;

    // Constructing an object mapping provinces to the cities they contain
    this.cities = this.provinces.reduce((acc, province) => {
                        acc[province] = [];
                        return acc;
                    }, {});

    this.data.forEach(e => {
        this.cities[e.province].push(e.city)
    });

    this.provinces.forEach(e => {
        this.cities[e] = [...new Set(this.cities[e])];
    })

    // prepare colors for range
    let colorArray = this.displayCategories.map( (d,i) => {
        return colors[i%10]
    })

    // Set ordinal color scale
    this.colorScale = d3.scaleOrdinal()
        .domain(this.displayCategories)
        .range(colorArray);

    
    this.structureIDMap = {RA3P: "Row and apartment structures of three units and over", 
                          R3P: "Row structures of three units and over", 
                          A3P: "Apartment structures of three units and over", 
                          A6P: "Apartment structures of six units and over"};
    this.structureFilters = data[1].data.reduce((acc, e) => {
                                acc[e.structure] = true;
                                return acc;
                            }, {});

    this.unitIDMap = {bachelor: "Bachelor units", onebed: "One bedroom units", twobed: "Two bedroom units", threebed: "Three bedroom units"};
    this.unitFilters = data[3].data.reduce((acc, e) => {
                                acc[e.unit] = true;
                                return acc;
                            }, {});

    filterElements.forEach(e => {
        this.createListener(e)
    })
}

	/*
	 * Method that initializes the visualization (static content, e.g. SVG area or axes)
 	*/
	initVis(){
		let vis = this;

		vis.margin = {top: 200, right: 200, bottom: 60, left: 40};

		vis.width = document.getElementById(vis.parentElement).getBoundingClientRect().width - vis.margin.left - vis.margin.right;
		vis.height = document.getElementById(vis.parentElement).getBoundingClientRect().height - vis.margin.top - vis.margin.bottom;

		// SVG drawing area
		vis.svg = d3.select("#" + vis.parentElement).append("svg")
			.attr("width", vis.width + vis.margin.left + vis.margin.right)
			.attr("height", vis.height + vis.margin.top + vis.margin.bottom)
			.append("g")
			.attr("transform", "translate(" + vis.margin.left + "," + vis.margin.top + ")");

		// Scales and axes
		vis.x = d3.scaleLog()
			.range([0, vis.width]);

		vis.y = d3.scaleLinear()
			.range([vis.height, 0]);

		vis.xAxis = d3.axisBottom()
			.scale(vis.x);

		vis.yAxis = d3.axisLeft()
			.scale(vis.y);

		vis.svg.append("g")
			.attr("class", "x-axis axis")
			.attr("transform", "translate(0," + vis.height + ")");

		vis.svg.append("g")
			.attr("class", "y-axis axis");

		vis.tooltip = vis.svg.append("text")
					  .attr("x", 0)
					  .attr("y", 0)

         vis.wrangleData();

	}

    // Accumulates averages over the current displayCategory
    accumulateAvg() {
        let vis = this;
        let newData = [];
        this.data.forEach(e =>  {
            let accAvg = 0;
            let num = 0;

            e.data.forEach(e => {
                let include = vis.structureFilters[e.structure] && vis.unitFilters[e.unit]
                accAvg += e.avg * include;
                num += include;
            })

            if (num > 0)    {
                newData.push(e);
                accAvg /= num;
                newData[newData.length - 1].avg = accAvg
            }
        })

        if (vis.provinceMode)   {
            let provinceData = [];

            newData.forEach(e =>    {
                // accumulating averages across cities
                if(provinceData.length > 0 && provinceData[provinceData.length - 1].province == e.province)    {
                    
                    provinceData[provinceData.length - 1].pop += e.pop;
                    provinceData[provinceData.length - 1].avg += e.avg;
                    provinceData[provinceData.length - 1].cityNum += 1;
                }   else    {
                    let currObj = {province: e.province, year: e.year, pop: e.pop, avg: e.avg, cityNum: 1}
                    provinceData.push(currObj)
                }
            })

            // final average calculation
            provinceData.forEach(e =>   {
                e.avg /= e.cityNum
            })

            provinceData = provinceData.sort(function(a, b) {
                return a.pop - b.pop;
            })

            vis.displayData = provinceData;
        }   else    {
            // If we are examining cities in a province, vis.displayCategories will be the cities we want to look at
            let filteredData = newData.filter(function(e)   {
                return vis.displayCategories.includes(e.city)
            })

            vis.displayData = filteredData;
        }
    }

    handleClick(d)   {
        let vis = this;
        vis.provinceMode = !vis.provinceMode;

        if (vis.provinceMode)   {
            vis.displayCategories = vis.provinces;
        }   else    {
            vis.displayCategories = vis.cities[d.province]
        }
        vis.wrangleData();
    }

    createListener(checkbox)    {
        let vis = this;
        let check = d3.select("#" + checkbox)
        check.property("checked", true)
        
        check.on("change", function(d)  {
            if (checkbox.length < 5)    {
                
                vis.structureFilters[vis.structureIDMap[checkbox]] = this.checked;
                console.log(vis.structureFilters)
            }   else    {
                vis.unitFilters[vis.unitIDMap[checkbox]] = this.checked;
            }
            vis.wrangleData();
        })
    }

	/*
 	* Data wrangling
 	*/
	wrangleData(){
		let vis = this;
        vis.accumulateAvg();
		// Update the visualization
		vis.updateVis();
	}

	/*
	 * The drawing function - should use the D3 update sequence (enter, update, exit)
 	* Function parameters only needed if different kinds of updates are needed
 	*/
	updateVis(){
		let vis = this;

        vis.x.domain(d3.extent(vis.displayData, d=> d.pop));
        vis.y.domain(d3.extent(vis.displayData, d=> d.avg));

    	let line = d3.line()
            .x(d => vis.x(d.pop))
            .y(d => vis.y(d.avg));

        let circles = vis.svg.selectAll("circle")
                             .data(vis.displayData);

        circles.enter().append("circle")
               .merge(circles)
               	.on("mouseover", function(e, d)	{
                if(vis.provinceMode)    {
                    vis.tooltip.text(d[0].province);
                }   else    {
                    vis.tooltip.text(d[0].city);
                }
                })
                .on("click", function(e, d)    {
                    vis.handleClick(d)
                })
               .transition()
               .duration(750)
               .attr("fill", function(d, i) {
                if (vis.provinceMode)   {
                    return vis.colorScale(d.province);
                }   else    {
                    return "black"
                }   
               })
               	.attr("cx", function(d) {
				return vis.x(d.pop); 
                })
                .attr("cy", function(d) {
                    return vis.y(d.avg); 
                })
                .attr("r", 2)
                
        circles.exit().remove()

        let nested = d3.group(vis.displayData, d => (vis.provinceMode) ? d.province : d.city);
        let lines = vis.svg.selectAll(".line")
            .data(Array.from(nested.values()));

        lines.enter()
            .append("path")
            .attr("class", "line")
            .merge(lines)
            .on("mouseover", function(e, d)	{
                if(vis.provinceMode)    {
                    vis.tooltip.text(d[0].province);
                }   else    {
                    vis.tooltip.text(d[0].city);
                }
                
            })
            .on("click", function(e, d) {
                vis.handleClick(d[0])
            })
            .transition()
            .duration(750)
            .attr("fill", "none")
            .attr("stroke", function(d) {
                if (vis.provinceMode)   {
                    return vis.colorScale(d[0].province);
                }   else    {
                    return "black"
                }   
            })  // color per province
            .attr("stroke-width", 1.5)
            .attr("d", d => {
                // Sort by x (pop) so lines connect left-to-right
                return line(d.sort((a,b) => d3.ascending(a.pop, b.pop)));
            });
        lines.exit().remove()
                                

		// Call axis functions with the new domain
		vis.svg.select(".x-axis").call(vis.xAxis);
		vis.svg.select(".y-axis").call(vis.yAxis);
	}
}