
// Start application by loading the data

let currTabNum = 0
let pageCount = 1;
let popChart;
let constructionChart;
let cleanedPopData;
let incomeRentData;
let incomeVisData;

loadData();

function loadData() {
    d3.csv("data/avg_rent_by_pop.csv"). then(data=>{
        cleanedPopData = preparePopRentData(data);
        popChart = new PopulationRentChart("vis5-area", "vis5-city-search", "vis5-city-list", "vis5-city-dropdown", "vis5-area-list", 
                                            "vis5-selected-cities", cleanedPopData)

        // Load and create the building visualization (D3/SVG version)
        d3.json("data/BURAK_cities_data_by_unit_type.json").then(data => {
            initVacancyVisD3(data);
            initControl()

        Promise.all([
            d3.csv('data/construction/housing_completions_dwelling_type_by_province_2013-2023.csv'),
            d3.text('data/construction/canadian-population.csv')
        ]).then(([housingData, populationText]) => {
            constructionChart = new ConstructionVisualization(housingData, populationText)
        })

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
        if (page == 4)  {
            changePage(2)
        }   else if (page == 7) {
            changePage(3)
        }   else if (page == 3) {
            changePage(6)
        }   else    {
            changePage(page - 1, page)
        }
        
    })
    rightBend.on("click", function() {
        if (page == 2)  {
            changePage(4)
        }   else if (page == 6) {
            changePage(3)
        }   else if (page == 3) {
            changePage(7)
        }   else    {
            changePage(page + 1, page)
        }
    })


    let currTab = d3.select('[data-target="vis' + currTabNum + '"]');
    currTab.attr("class", "tab")

    let newTab = d3.select('[data-target="vis' + page + '"]');
    newTab.attr("class", "tab active-tab")

    let currVis = d3.select('[data-content="vis' + currTabNum + '"]');
    currVis.attr("class", "content")

    let newVis = d3.select('[data-content="vis' + page + '"]');
    newVis.attr("class", "content active")

    if (currTabNum != page) {
    if (currTabNum == 1)    {
        // Cleanup mortgage visualization
        if (typeof destructMortgageVisualization !== 'undefined') {
            destructMortgageVisualization();
        }
    }   else if (currTabNum == 3)    {
        if (typeof destructIncomeVisV2 !== 'undefined') {
            destructIncomeVisV2();
        }
    }   else if (currTabNum == 4)   {
        popChart.destructVis();
    }   else if (currTabNum == 6)   {
        constructionChart.destructVis();
    }

        currTabNum = page;
        if (page == 1)  {
            // Initialize mortgage visualization (vis1)
            if (typeof initMortgageVisualization !== 'undefined') {
                initMortgageVisualization();
            }
        }   else if (page == 3)  {
            if (typeof initIncomeVisV2 !== 'undefined') {
                initIncomeVisV2(incomeRentData, incomeVisData);
            }
        }   else if (page == 4)  {
            popChart.initVis();
        }   else if (page == 6)  {
            constructionChart.initVis();
        }   

            pageCount += 1;
            if (pageCount < 8)  {
                let nextTab = d3.select('[data-target="vis' + pageCount + '"]');
                nextTab.style("display", "block")
            }
        }
    }

// Initialize the housing units map visualization
initCityMap();
