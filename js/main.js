
// Start application by loading the data

let currTabNum = 0
let pageCount = 1;
let popChart;
let cleanedPopData;
let incomeRentData;
let incomeVisData;

loadData();

function loadData() {
    d3.csv("data/avg_rent_by_pop.csv"). then(data=>{
        cleanedPopData = preparePopRentData(data);
        popChart = new PopulationRentChart("vis5-area", "vis5-city-search", "vis5-city-list", "vis5-city-dropdown", "vis5-area-list", 
                                            "vis5-selected-cities", cleanedPopData)

        // Load and create the building visualization
        d3.json("data/BURAK_cities_data_multi_year.json").then(data => {
            initVacancyVis(data);
            initControl()

            Promise.all([
                d3.csv("data/jeff/rent-prices.csv").then(rows => rows.map(row => mapRowBySchema(row, RENT_DATA_MAP))),
                d3.csv("data/jeff/u65incomedata.csv").then(rows => rows.filter(row => ['A', 'B', 'C', 'D', 'E'].includes(row.STATUS))
                    .map(row => mapRowBySchema(row, INCOME_DATA_MAP)))
            ]).then(([rawRentData, rawIncomeData]) => {
                incomeRentData = rawRentData;
                incomeVisData = rawIncomeData;
            }).catch(error => {
                console.error("Failed to load income/rent datasets", error);
            });
        }).catch(error => {
            console.error('Error loading data:', error);
            document.getElementById('buildings-container').innerHTML =
                '<p style="color: #ff6b6b; text-align: center;">Error loading visualization data.</p>';
        });
    })

}

function preparePopRentData(data){
    cleaned_data = []

    data.forEach(e => {
        let loc = e.GEO;

        let index = loc.indexOf(",");
        let city = loc.slice(0, index);
        let dataObj = {structure: e["Type of structure"], unit: e["Type of unit"], avg: +e.VALUE}

        if (cleaned_data.length > 0 && cleaned_data[cleaned_data.length - 1].city == city) {
            cleaned_data[cleaned_data.length - 1].data.push(dataObj)
        }   else    {
            let province = loc.slice(index + 2);
            let locObj = {year: e.REF_DATE, city: city, province: province, pop: +e.POP, data: [dataObj]};
            cleaned_data.push(locObj)
        }        
    });
    return cleaned_data;
}

function initControl()  {

    // idk why but select by id doesnt work
    for (let i = 0; i < 8; i++) {
        let currTab = d3.select('[data-target="vis' + i + '"]');
        currTab.on("click", function() {
            changePage(i)
        });
        if (i > 1)  {
            //currTab.style("display", "none")
        }
        }
    let rightBend = d3.select('#right-bend');
    rightBend.on("click", function() {
        changePage(1, 0)
    })
}

function changePage(page)   {
    let leftBend = d3.select('#left-bend');
    let rightBend = d3.select('#right-bend');
    if (page == 0)  {
        rightBend.style("display", "block")
        leftBend.style("display", "none")
    }   else if (page == 7) {
        leftBend.style("display", "block")
        rightBend.style("display", "none")
    }   else    {
        leftBend.style("display", "block")
        rightBend.style("display", "block")
    }
    leftBend.on("click", function() {
        changePage(page - 1, page)
    })
    rightBend.on("click", function() {
        changePage(page + 1, page)
    })


    let currTab = d3.select('[data-target="vis' + currTabNum + '"]');
    currTab.attr("class", "tab")

    let newTab = d3.select('[data-target="vis' + page + '"]');
    newTab.attr("class", "tab active-tab")

    let currVis = d3.select('[data-content="vis' + currTabNum + '"]');
    currVis.attr("class", "content")

    let newVis = d3.select('[data-content="vis' + page + '"]');
    newVis.attr("class", "content active")

    if (currTabNum == 3)    {
        destructIncomeVis();
    }   else if (currTabNum == 4)   {
        popChart.destructVis();
    }   else if (currTabNum == 6)   {
        // Destruct construction vis if needed
    }

    currTabNum = page;
    if (page == 3)  {
        initIncomeVis(incomeRentData, incomeVisData);
    }   else if (page == 4)  {
        popChart.initVis();
    }   else if (page == 6)  {
        initConstructionVisualization();
    }   

    pageCount += 1;
    if (pageCount < 8)  {
        let nextTab = d3.select('[data-target="vis' + pageCount + '"]');
        nextTab.style("display", "block")
    }
}

// Initialize the housing units map visualization
initCityMap();
