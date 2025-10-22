import pandas as pd
import json
import os

# Read the datasets with proper header handling
vacancy_df = pd.read_excel('data/rental/urban/urban-rental-market-survey-data-vacancy-rates-2023-en.xlsx', header=None)
rent_df = pd.read_excel('data/rental/urban/urban-rental-market-survey-data-average-rents-urban-centres-2023-en.xlsx', header=None)

# Save full preview
with open('data_full_preview.txt', 'w', encoding='utf-8') as f:
    f.write("VACANCY DATA (First 50 rows)\n")
    f.write("="*120 + "\n")
    pd.set_option('display.max_columns', None)
    pd.set_option('display.width', None)
    f.write(vacancy_df.head(50).to_string() + "\n\n")

    f.write("\n\nRENT DATA (First 50 rows)\n")
    f.write("="*120 + "\n")
    f.write(rent_df.head(50).to_string() + "\n")

print("Data preview saved to data_full_preview.txt")
print(f"Vacancy data shape: {vacancy_df.shape}")
print(f"Rent data shape: {rent_df.shape}")
