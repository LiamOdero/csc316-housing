import pandas as pd
import json
import os
import re

# Read the rental datasets
vacancy_df = pd.read_excel('data/rental/urban/urban-rental-market-survey-data-vacancy-rates-2023-en.xlsx', header=None)
rent_df = pd.read_excel('data/rental/urban/urban-rental-market-survey-data-average-rents-urban-centres-2023-en.xlsx', header=None)

# Read the population data from Statistics Canada
print("Loading population data from data/population/17100148.csv...")
population_df = pd.read_csv('data/population/17100148.csv', encoding='utf-8-sig', low_memory=False)

# Filter for 2023 data (matching the rental data year), Total gender (not male/female),
# and All ages (not age groups or individual ages) to get the complete population for each CMA
population_filtered = population_df[
    (population_df['REF_DATE'] == 2023) &
    (population_df['Gender'] == 'Total - gender') &
    (population_df['Age group'] == 'All ages')
].copy()

# The actual data starts at row 3 (0-indexed)
# Column structure: 0=Province, 1=Centre (City), 2=Census Subdivision, 3=Dwelling Type,
# 4=Bachelor, 6=1 Bedroom, 8=2 Bedroom, 10=3 Bedroom+, 12=Total

# Filter for "Total" dwelling type rows which aggregate all dwelling types
vacancy_total = vacancy_df[vacancy_df[3] == 'Total'].copy()
rent_total = rent_df[rent_df[3] == 'Total'].copy()

# Function to clean percentage and rent values
def clean_percentage(val):
    if pd.isna(val) or val in ['--', '**', 'NaN']:
        return None
    if isinstance(val, str):
        # Remove percentage sign and letters (quality indicators)
        cleaned = re.sub(r'[%a-zA-Z\s]', '', val)
        try:
            return float(cleaned)
        except:
            return None
    return float(val) if not pd.isna(val) else None

def clean_rent(val):
    if pd.isna(val) or val in ['--', '**', 'NaN']:
        return None
    if isinstance(val, str):
        # Remove dollar sign and letters (quality indicators)
        cleaned = re.sub(r'[\$,a-zA-Z\s]', '', val)
        try:
            return float(cleaned)
        except:
            return None
    return float(val) if not pd.isna(val) else None

# Process vacancy data
vacancy_total['city'] = vacancy_total[1]
vacancy_total['province'] = vacancy_total[0]
vacancy_total['vacancy_rate'] = vacancy_total[12].apply(clean_percentage)

# Process rent data
rent_total['city'] = rent_total[1]
rent_total['province'] = rent_total[0]
rent_total['avg_rent'] = rent_total[12].apply(clean_rent)

# Get unique cities (exclude subdivision rows - only keep centre-level totals)
# Centre-level totals have "Total" in the Census Subdivision column
vacancy_cities = vacancy_total[vacancy_total[2] == 'Total'][['city', 'province', 'vacancy_rate']].copy()
rent_cities = rent_total[rent_total[2] == 'Total'][['city', 'province', 'avg_rent']].copy()

# Merge the datasets
merged = pd.merge(vacancy_cities, rent_cities, on=['city', 'province'], how='inner')

# Remove rows with missing data
merged = merged.dropna(subset=['vacancy_rate', 'avg_rent'])

# Create population mapping from Statistics Canada data
# Extract city name from GEO field (e.g., "Toronto (CMA), Ontario" -> "Toronto")
def extract_city_name(geo_name):
    """Extract the city name from the full GEO field."""
    # Handle special cases first
    if 'Ottawa - Gatineau' in geo_name:
        if 'Ontario part' in geo_name or 'Ontario Part' in geo_name:
            return 'Ottawa-Gatineau (Ontario Part/Partie de l\'Ontario)'
        elif 'Quebec part' in geo_name or 'Québec part' in geo_name or 'Quebec Part' in geo_name or 'Québec Part' in geo_name:
            return 'Ottawa-Gatineau (Québec Part/Partie du Québec)'
        else:
            return 'Ottawa-Gatineau'

    # Extract the city name before " (CMA)" or " (CA)"
    if ' (CMA)' in geo_name:
        city = geo_name.split(' (CMA)')[0]
    elif ' (CA)' in geo_name:
        city = geo_name.split(' (CA)')[0]
    else:
        city = geo_name

    # Handle special naming variations
    city_mapping = {
        'Québec': 'Quebec',
        'St. John\'s': 'St. John\'s',
        'Kitchener - Cambridge - Waterloo': 'Kitchener-Cambridge-Waterloo',
        'St. Catharines - Niagara': 'St. Catharines-Niagara',
        'Abbotsford - Mission': 'Abbotsford-Mission',
    }

    return city_mapping.get(city, city)

# Create the population dictionary from the filtered data
population_data = {}
for _, row in population_filtered.iterrows():
    geo_name = row['GEO']
    population_value = row['VALUE']

    # Skip aggregate records
    if 'All census' in geo_name or 'Canada' == geo_name or 'Area outside' in geo_name:
        continue

    city_name = extract_city_name(geo_name)

    # Only keep if we have a valid population value
    if pd.notna(population_value) and population_value > 0:
        population_data[city_name] = int(population_value)

print(f"\nLoaded population data for {len(population_data)} cities")
print("Sample population data:")
for city in ['Toronto', 'Montréal', 'Vancouver', 'Calgary', 'Edmonton']:
    if city in population_data:
        print(f"  {city}: {population_data[city]:,}")

merged['population'] = merged['city'].map(population_data)

# Sort by population and data completeness
merged = merged.sort_values('population', ascending=False, na_position='last')

print("All cities with complete data:")
print(merged[['city', 'province', 'vacancy_rate', 'avg_rent', 'population']].head(30))
print(f"\nTotal cities: {len(merged)}")

# Select 8 diverse cities based on criteria:
# - Mix of high (>2%) and low (<=2%) vacancy rates
# - Include major cities
# - Geographic distribution across Canada

selected_cities = []

# High vacancy cities (>2%)
high_vacancy = merged[merged['vacancy_rate'] > 2.0].sort_values('population', ascending=False)
print("\nHigh vacancy rate cities (>2%):")
print(high_vacancy[['city', 'vacancy_rate', 'avg_rent', 'population']].head(10))

# Low vacancy cities (<=2%)
low_vacancy = merged[merged['vacancy_rate'] <= 2.0].sort_values('population', ascending=False)
print("\nLow vacancy rate cities (<=2%):")
print(low_vacancy[['city', 'vacancy_rate', 'avg_rent', 'population']].head(10))

# Manual selection for diversity
selected_city_names = [
    'Toronto',           # Low vacancy, high rent, major city
    'Vancouver',         # Low vacancy, high rent, BC
    'Montréal',          # Mixed, Quebec, major city
    'Calgary',           # Low vacancy, high rent, Alberta
    'Edmonton',          # HIGH vacancy (2.3%), Alberta
    'Halifax',           # Low vacancy, Atlantic Canada
    'Winnipeg',          # Medium vacancy, Prairies
    'Victoria',          # Low vacancy, high rent, BC
    # Additional HIGH vacancy cities (>2%)
    'Hamilton',          # HIGH vacancy (2.1%), Ontario
    'Windsor',           # HIGH vacancy (2.1%), Ontario
    'Barrie',            # HIGH vacancy (2.7%), Ontario
]

# Filter to selected cities
final_data = merged[merged['city'].isin(selected_city_names)].copy()

print("\n\nFinal selected cities:")
print(final_data[['city', 'province', 'vacancy_rate', 'avg_rent', 'population']])

# Create output directory
os.makedirs('cleared_data/Burak\'s-cleared-data', exist_ok=True)

# Convert to JSON format for visualization
cities_json = []
for _, row in final_data.iterrows():
    city_data = {
        'city': row['city'],
        'province': row['province'],
        'vacancy_rate': float(row['vacancy_rate']),
        'avg_rent': float(row['avg_rent']),
        'population': int(row['population']) if pd.notna(row['population']) else 100000
    }
    cities_json.append(city_data)

# Save to JSON
with open('cleared_data/Burak\'s-cleared-data/cities_data.json', 'w') as f:
    json.dump(cities_json, f, indent=2)

print(f"\n✓ Data saved to cleared_data/Burak's-cleared-data/cities_data.json")
print(f"✓ Selected {len(cities_json)} cities")
