#!/usr/bin/env python3
"""
Script to clean and transform Statistics Canada rental data CSV.
Reads data/rental-data/rental-data.csv (long format Statistics Canada data)
Matches the structure of rental_city_merged.csv with columns:
year, city, province, latitude, longitude, population, housing_type, structure_type, rent_price, id
"""

import pandas as pd
import re
from pathlib import Path

def clean_city_name(city_with_province):
    """Extract city name from 'City, Province' format"""
    # Remove province suffix (everything after the last comma)
    city = re.sub(r',\s*[^,]+$', '', city_with_province).strip()
    return city

def parse_rental_data():
    """Parse the Statistics Canada rental data CSV"""
    
    # Read the rental data file (Statistics Canada format)
    rental_file = Path('data/rental-data/rental-data.csv')
    city_file = Path('data/canadacities_clean.csv')
    
    print("Loading rental data...")
    df = pd.read_csv(rental_file)
    
    print(f"Loaded {len(df)} rows from rental data")
    print(f"Columns: {df.columns.tolist()}")
    
    # Filter out rows with missing or suppressed data
    # STATUS='F' means suppressed, VALUE is the actual rent price
    df = df[df['STATUS'] != 'F'].copy()
    df = df[df['VALUE'].notna()].copy()
    df = df[df['VALUE'] != ''].copy()
    
    # Convert VALUE to numeric
    df['VALUE'] = pd.to_numeric(df['VALUE'], errors='coerce')
    df = df[df['VALUE'] > 0].copy()
    
    print(f"After filtering missing data: {len(df)} rows")
    
    # Clean city names (remove province suffix)
    df['city_clean'] = df['GEO'].apply(clean_city_name)
    
    # Load city reference data for coordinates
    print("Loading city coordinates...")
    cities_df = pd.read_csv(city_file)
    
    # Create lookup dictionary
    city_lookup = {}
    for _, row in cities_df.iterrows():
        city_key = row['city'].strip().lower()
        city_lookup[city_key] = {
            'province': row['province'],
            'latitude': row['latitude'],
            'longitude': row['longitude'],
            'population': row['population']
        }
    
    print(f"Loaded {len(city_lookup)} cities with coordinates")
    
    # Match cities with coordinates
    def get_city_info(city_name):
        city_key = city_name.lower().strip()
        
        # Direct match
        if city_key in city_lookup:
            return city_lookup[city_key]
        
        # Try partial match
        for lookup_city, meta in city_lookup.items():
            if city_key in lookup_city or lookup_city in city_key:
                return meta
        
        return None
    
    df['city_info'] = df['city_clean'].apply(get_city_info)
    
    # Filter to only cities with coordinates
    df = df[df['city_info'].notna()].copy()
    
    print(f"After matching with coordinates: {len(df)} rows")
    print(f"Unique cities: {df['city_clean'].nunique()}")
    
    # Extract city info into separate columns
    df['province'] = df['city_info'].apply(lambda x: x['province'] if x else None)
    df['latitude'] = df['city_info'].apply(lambda x: x['latitude'] if x else None)
    df['longitude'] = df['city_info'].apply(lambda x: x['longitude'] if x else None)
    df['population'] = df['city_info'].apply(lambda x: x['population'] if x else None)
    
    # Create final dataframe with required columns
    result = pd.DataFrame({
        'year': df['REF_DATE'].astype(int),
        'city': df['city_clean'],
        'province': df['province'],
        'latitude': df['latitude'],
        'longitude': df['longitude'],
        'population': df['population'],
        'housing_type': df['Type of unit'],
        'structure_type': df['Type of structure'],
        'rent_price': df['VALUE'],
        'id': df.apply(lambda x: f"{x['REF_DATE']}{x['city_clean'].replace(' ', '').replace('-', '')[:10]}{x['Type of unit'][:5]}", axis=1)
    })
    
    # Remove duplicates (keep first occurrence)
    result = result.drop_duplicates(subset=['year', 'city', 'housing_type', 'structure_type'])
    
    # Sort by year, city, housing_type
    result = result.sort_values(['year', 'city', 'housing_type', 'structure_type'])
    
    # Show summary
    years = sorted(result['year'].unique())
    print(f"\nYear range: {min(years)} to {max(years)} ({len(years)} years)")
    print(f"Cities: {result['city'].nunique()}")
    print(f"Housing types: {result['housing_type'].nunique()}")
    print(f"Structure types: {result['structure_type'].nunique()}")
    
    return result

def main():
    print("=" * 60)
    print("Cleaning rental data CSV")
    print("=" * 60)
    
    # Parse data
    df = parse_rental_data()
    
    # Save to CSV
    output_file = Path('data/rental_city_merged.csv')
    df.to_csv(output_file, index=False)
    print(f"\nSaved {len(df)} records to {output_file}")
    
    # Show sample
    print("\nSample records:")
    print(df.head(10))
    
    print("\nDone!")

if __name__ == '__main__':
    main()
