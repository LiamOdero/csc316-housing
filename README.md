# Canada Mortgage Affordability Heatmap

A D3.js visualization showing mortgage affordability across Canadian provinces and major metro areas. The heatmap uses a color scale from red (unaffordable) to green (affordable) based on the 30% income rule for mortgage payments.

## Features

- **Interactive Heatmap**: Color-coded provinces and metro areas based on mortgage affordability
- **Income Slider**: Adjust your annual income to see how affordability changes dynamically
- **Province Boundaries**: Clear provincial boundaries with hover tooltips
- **Metro Area Indicators**: Major Canadian cities marked with interactive circles
- **Data Table**: Detailed breakdown of affordability by province
- **Responsive Design**: Works on desktop and mobile devices

## How to Use

1. **Open `index.html`** in a web browser
2. **Adjust the income slider** to set your annual income
3. **Hover over provinces** to see detailed affordability information
4. **Click on metro areas** to see city-specific data
5. **View the data table** for a comprehensive breakdown

## Color Scale

- **Red**: Unaffordable (mortgage payment > 30% of monthly income)
- **Orange**: Moderately unaffordable
- **Yellow**: Borderline affordable
- **Green**: Affordable (mortgage payment ≤ 30% of monthly income)

## Data Sources

The visualization uses sample data representing average monthly mortgage payments across Canadian provinces and major metro areas. In a real implementation, this would be connected to actual mortgage data from sources like:

- Canada Mortgage and Housing Corporation (CMHC)
- Statistics Canada
- Real estate boards

## Technical Details

- **D3.js v7**: For data visualization and mapping
- **TopoJSON**: For efficient geographic data
- **Responsive SVG**: Scales with screen size
- **Interactive Tooltips**: Show detailed information on hover
- **Dynamic Updates**: Real-time recalculation based on income input

## File Structure

```
├── index.html              # Main HTML file
├── css/
│   └── style.css          # Styling and responsive design
├── js/
│   └── visualization.js   # D3.js visualization logic
└── data/
    ├── canada_mortgage_data.csv    # Mortgage payment data
    └── canada_provinces.json       # Geographic boundaries
```

## Customization

To customize the visualization:

1. **Update data**: Modify `data/canada_mortgage_data.csv` with real mortgage data
2. **Adjust colors**: Change the color scale in `js/visualization.js`
3. **Add metro areas**: Include more cities in the metro areas array
4. **Modify affordability calculation**: Adjust the 30% rule in the calculation functions

## Browser Compatibility

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## License

This project is for educational and demonstration purposes.

