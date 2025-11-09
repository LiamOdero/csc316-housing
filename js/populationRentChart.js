
/*
 * PopulationRentChart - ES6 Class
 * @param  parentElement 	-- the HTML element in which to draw the visualization
 * @param  data             -- the data the that's provided initially
 *
 * @param  focus            -- a switch that indicates the current mode (focus or stacked overview)
 * @param  selectedIndex    -- a global 'variable' inside the class that keeps track of the index of the selected area
 */

let NUM_CATEGORIES = 11;

class PopulationRentChart {

// constructor method to initialize PopulationRentChart object
constructor(parentElement, provinceSelect, provinceFilterArea, data) {
    this.parentElement = parentElement;

    // sorting the data to make accumulation logic simpler
    this.data = data.sort(function(a, b)    {
        return a.year - b.year || a.province.localeCompare(b.province)
    })

    this.displayData = [];

    // A list of all provinces in the dataset
    this.provinces = [...new Set(data.map(item => item.province))];

    // Has all cities / provinces currently displayed in the chart
    this.displayCategories = this.provinces

    // Constructing an object mapping provinces to the cities they contain
    this.cityFilter = this.provinces.reduce((acc, province) => {
                        acc[province] = [];
                        return acc;
                    }, {});

    this.data.forEach(e => {
        this.cityFilter[e.province].push(e.city)
    });

    // Inverse mapping of cities to provinces
    this.cityProvinceMap = {}
    let vis = this;

    this.provinces.forEach(e => {
        let citySet = [...new Set(this.cityFilter[e])];
        let currObj = {cityMode: false};
        let provivince = e;
        citySet.forEach(e =>    {
            currObj[e] = true;
            vis.cityProvinceMap[e] = provivince;
        })
        this.cityFilter[e] = currObj;
    })

    // Set ordinal color scale
    vis.popColorScale = d3.scaleLinear()
        .range(["green", "yellow", "red"]);
    vis.avgColorScale = d3.scaleLinear()
        .range(["green", "yellow", "red"]);

    this.unitIDMap = {bachelor: "Bachelor units", onebed: "One bedroom units", twobed: "Two bedroom units", threebed: "Three bedroom units"};
    this.unitFilters = data[3].data.reduce((acc, e) => {
                                acc[e.unit] = true;
                                return acc;
                            }, {});

    // Listener for province selection
    this.provinceFilterArea = d3.select("#" + provinceFilterArea);
    this.select = d3.select("#" + provinceSelect);
    this.select.on("change", function() {
        vis.createProvinceFilters(vis.select.property("value"));
    });
    this.createProvinceFilters(vis.select.property("value"));
}

	/*
	 * Method that initializes the visualization (static content, e.g. SVG area or axes)
 	*/
	initVis(){
		let vis = this;

		vis.margin = {top: 25, right: 100, bottom: 25, left: 175};

		vis.width = document.getElementById(vis.parentElement).getBoundingClientRect().width - vis.margin.left - vis.margin.right;
		vis.height = document.getElementById(vis.parentElement).getBoundingClientRect().height - vis.margin.top - vis.margin.bottom;

		// SVG drawing area
		vis.svg = d3.select("#" + vis.parentElement).append("svg")
			.attr("width", vis.width + vis.margin.left + vis.margin.right)
			.attr("height", vis.height + vis.margin.top + vis.margin.bottom)
			.append("g")
			.attr("transform", "translate(" + vis.margin.left + "," + vis.margin.top + ")");

		// Scales and axes
		vis.x = d3.scaleBand()
			.range([0, vis.width])
              .paddingInner(0.01);

		vis.y = d3.scaleBand()
			.range([vis.height, 0])
            .paddingInner(0.01);

		vis.xAxis = d3.axisBottom()
			.scale(vis.x);

		vis.yAxis = d3.axisLeft()
			.scale(vis.y)
		vis.svg.append("g")
			.attr("class", "x-axis axis")
			.attr("transform", "translate(0," + vis.height + ")");

		vis.svg.append("g")
			.attr("class", "y-axis axis")

        // create a tooltip
        vis.tooltip = d3.select("body")
            .append("div")
            .style("opacity", 1)
            .attr("class", "tooltip")
            .style("background-color", "white")
            .style("border", "solid")
            .style("border-width", "2px")
            .style("border-radius", "5px")
            .style("padding", "5px")
            .style("position", "absolute")
            .style("color", "black")
        vis.defs = vis.svg.append("defs");

        vis.wrangleData();
	}

    // Accumulates averages over the current displayCategory
    accumulateAvg() {
        let vis = this;
        let newData = [];

        // Collecting yearly averages across structure and unit types
        this.data.forEach(e =>  {
            let accAvg = 0;
            let num = 0;
            
            let include = vis.cityFilter[e.province][e.city];
                if (include)    {
                e.data.forEach(e => {
                    accAvg += e.avg * include;
                    num += include;
                })

                if (num > 0)    {
                    newData.push(e);
                    accAvg /= num;
                    newData[newData.length - 1].avg = accAvg
                }
            }
        })

        // Accumulate city data by province and average it out  
        let accumulatedData = [];

        newData.forEach((e, i) =>    {
            // accumulating averages across cities
            let currCategory = (vis.cityFilter[e.province].cityMode) ? e.city : e.province
            if (accumulatedData.length == 0 || vis.cityFilter[e.province].cityMode || (accumulatedData[accumulatedData.length - 1].category != currCategory) 
                || (accumulatedData[accumulatedData.length - 1].year!= e.year) )  {
                // Directly push an object in one of 4 cases: No other object in accumulated data, the current province is displaying each city,
                // or none of the above BUT the province or year have changed
                
                let currObj = {category: currCategory, year: e.year, pop: e.pop, avg: e.avg, cityNum: 1}
                accumulatedData.push(currObj)
            }   else    {
                // only accumulate if there is data, the province is the same and in the same year, and we arent displaying individual cities
                accumulatedData[accumulatedData.length - 1].pop += e.pop;
                accumulatedData[accumulatedData.length - 1].avg += e.avg;
                accumulatedData[accumulatedData.length - 1].cityNum += 1;
            }

        })
            
        accumulatedData = accumulatedData.sort(function(a, b) {
            return a.category.localeCompare(b.category)
        })

        let categories = [];
        
        // final average calculation
        accumulatedData.forEach((e, i) =>   {
            e.avg /= e.cityNum

            // 2001 is the first year in the dataset, so exclude the change
            // For some reason Parksville has 0 in rent for 2001 which i somehow doubt is correct, so this is the bandaid fix
            if (e.year == "2001" || (e.category == "Parksville" && e.year == "2002")) {
                e.popChange = 0;
                e.avgChange = 0;
            }   else    {
                e.popChange = (e.pop - accumulatedData[i - 1].pop) / (accumulatedData[i - 1].pop) * 100
                e.avgChange = (e.avg - accumulatedData[i - 1].avg) / accumulatedData[i - 1].avg * 100;
            }

            if (e.year == "2001")   {
                categories.push(e.category)
            }
        })
        vis.displayCategories = categories;
        let range = d3.extent(
            accumulatedData.filter(d => vis.displayCategories.includes(d.category)),
            d => d.popChange
        );

        vis.displayKeys = d3.ticks(range[0], range[1], NUM_CATEGORIES);
        vis.displayData = accumulatedData.filter(function (d)   {
            return d.year != "2001"
        })
    }

    handleClick(d)   {
        let vis = this;
        let category = d.category;
        if (vis.provinces.includes(category))   {
            // clicked on a province
            vis.provinces.forEach(e =>  {
                let currProvince = e;
                // disable other provinces
                if (e != category)  {
                    Object.keys(vis.cityFilter[currProvince]).forEach(e => {
                        vis.cityFilter[currProvince][e] = false;
                    })
                }   else    {
                    vis.cityFilter[e].cityMode = true;
                }

            })
            vis.select.property("value", category);
            this.createProvinceFilters(category)
            
        }   else    {
            //clicked on a city
            let province = vis.cityProvinceMap[category];
            vis.cityFilter[province].cityMode = false;
        }

        vis.wrangleData();
    }


    
    createProvinceFilters(province)    {
        let vis = this;
        let cities = ["All " + province];
        let allCheckPre = true;

        if (province == "All Provinces")    {
            vis.provinces.forEach(e =>  {
                cities.push(e); 
                let check = false;
                let currProvince = e
                Object.keys(vis.cityFilter[currProvince]).forEach(e =>   {
                    if (e != "cityMode")    {
                        check = check || vis.cityFilter[currProvince][e];
                    }
                })
                allCheckPre = check && allCheckPre
            })


        }   else    {
            Object.keys(vis.cityFilter[province]).forEach(e =>   {
                if (e != "cityMode")    {
                    cities.push(e)
                    allCheckPre = allCheckPre && vis.cityFilter[province][e];
                }
            })
        }

        let citySelection = vis.provinceFilterArea.selectAll(".city-checkbox")
                                           .data(cities, d => d);
        citySelection.exit()
            .transition()
            .duration(200)
            .style("opacity", 0)
            .remove();

        let cityEnter = citySelection.enter()
            .append("div")
            .attr("class", "form-check city-checkbox")
            .style("opacity", 0);

        cityEnter.append("input")
            .attr("class", "form-check-input")
            .attr("type", "checkbox")
            .attr("id", d => `check-${d.replace(/[^a-zA-Z0-9_-]/g, "_")}`)
            .attr("value", d => d)
            .property("checked", function(d)    {
                if (d.slice(0, 3) == "All") {
                    return allCheckPre;
                }   else    {
                    if (province == "All Provinces")    {
                        let check = false;
                        Object.keys(vis.cityFilter[d]).forEach(e =>   {
                            if (e != "cityMode")    {
                                check = check || vis.cityFilter[d][e];
                            }
                        })
                        return check;
                    }   else    {
                        return vis.cityFilter[province][d];
                    }
                }
            })
            .on("change", function(d)   {
                let target = d.target.value;
                if (target.slice(0, 3) == "All")    {
                    let allCheck = d.target.checked;

                    if (province == "All Provinces")    {
                        vis.provinces.forEach(e =>  {
                            Object.keys(vis.cityFilter[e]).forEach(j =>   {
                            if (j != "cityMode")    {
                                vis.cityFilter[e][j] = d.target.checked;;
                            }
                            d3.select(`#check-${e.replace(/[^a-zA-Z0-9_-]/g, "_")}`)
                                .property("checked", allCheck);
                        })
                        })
                    }   else    {
                        cities.forEach(e => {
                            if (e.slice(0, 3) != "All") {
                                vis.cityFilter[province][e] = allCheck;

                                d3.select(`#check-${e.replace(/[^a-zA-Z0-9_-]/g, "_")}`)
                                        .property("checked", allCheck);
                            }
                        })
                    }

                }   else    {
                    if (province == "All Provinces")    {
                        Object.keys(vis.cityFilter[target]).forEach(e =>   {
                            if (e != "cityMode")    {
                                vis.cityFilter[target][e] = d.target.checked;;
                            }
                        })
                    }   else    {
                        vis.cityFilter[province][target] = !vis.cityFilter[province][target];
                    }
                }
                vis.wrangleData();
            });


        cityEnter.append("label")
            .attr("class", "form-check-label")
            .attr("for", d => `check-${d}`)
            .text(function(d)  {
                if (d.slice(0, 3) == "All") {
                    return "All";
                }   else    {
                    return d;
                }
            });

        cityEnter.merge(citySelection)
            .transition()
            .duration(200)
            .style("opacity", 1);
        }

	/*
 	* Data wrangling
 	*/
	wrangleData(){
		let vis = this;
        vis.accumulateAvg();
		vis.updateVis();
	}

    sanitizeId(str) {
        return str.replace(/[^a-zA-Z0-9_-]/g, "_");
    }


	/*
	 * The drawing function - should use the D3 update sequence (enter, update, exit)
 	* Function parameters only needed if different kinds of updates are needed
 	*/
	updateVis(){
		let vis = this;
        console.log(this.displayData)
        vis.x.domain([...new Set(vis.displayData.map(item => item.year))]);
        vis.y.domain(vis.displayCategories)
        vis.popColorScale.domain([d3.min(vis.displayData, d => d.popChange),
                               d3.median(vis.displayData, d => d.popChange),
                               d3.max(vis.displayData, d => d.popChange)
        ])
        vis.avgColorScale.domain([d3.min(vis.displayData, d => d.avgChange),
                               d3.median(vis.displayData, d => d.avgChange),
                               d3.max(vis.displayData, d => d.avgChange)
        ])

        // build gradients
        vis.displayData.forEach(d => {
            const gradId = `grad-${d.year}-${d.category.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
            
            let gradient = vis.defs.append("linearGradient")
                .attr("id", gradId)
                .attr("x1", "0%")
                .attr("y1", "0%")
                .attr("x2", "100%")
                .attr("y2", "100%");
            
            gradient.append("stop")
                .attr("offset", "0%")
                .attr("stop-color", vis.avgColorScale(d.avgChange));
            
            gradient.append("stop")
                .attr("offset", "100%")
                .attr("stop-color", vis.popColorScale(d.popChange));
        });

        let boxes = vis.svg.selectAll("rect")
                       .data(vis.displayData)

        boxes.enter().append("rect")    
                     .merge(boxes)
                     .on("mouseover", function(d)   {
                        d3.select(this)
                          .style("stroke", "black")
                          .style("stroke-width", 1)
                        vis.tooltip.style("opacity", 1)
                     })
                     .on("mouseleave", function(d)   {
                        d3.select(this)
                          .style("stroke-width", 0)
                        vis.tooltip.style("opacity", 0)
                     })
                     .on("mousemove", function(e, d)   {
                        const [x, y] = d3.pointer(e);
                        vis.tooltip
                            .style("left", (e.pageX + 10) + "px")
                            .style("top", (e.pageY + 10) + "px")
                            .html(`
                            <strong>${d.category}</strong><br/>
                            Year: ${d.year}<br/>
                            Change in Rent Since: ${d.avgChange.toFixed(2)}%<br/>
                            Change in Population: ${d.popChange.toFixed(2)}%
                            `);
                     })
                     .on("click", function(e, d)   {
                        vis.handleClick(d)
                     })
                     .transition(750)
                     .attr("width", vis.x.bandwidth())
                     .attr("height", vis.y.bandwidth())
                     .attr("x", d => vis.x(d.year))
                     .attr("y", d => vis.y(d.category))
                     .style("fill", d => `url(#grad-${d.year}-${d.category.replace(/[^a-zA-Z0-9_-]/g, "_")})`)
        boxes.exit().remove();  

		// Call axis functions with the new domain
		vis.svg.select(".x-axis").call(vis.xAxis);
        vis.svg.select(".y-axis").call(vis.yAxis);
	}
}