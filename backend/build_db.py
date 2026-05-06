import sqlite3

import pandas as pd


NULL_VALUES = {"", "None", "NULL", "ND", "nan", "NaN"}
TITLE_CASE_COLUMNS = {"status", "remarks", "commodity", "province", "municipality", "barangay", "region"}
INDEX_COLUMNS = ["province", "commodity", "contractor", "status"]


def normalize_text(value):
    value = "" if pd.isna(value) else str(value).strip()
    if value in NULL_VALUES:
        return None
    return " ".join(value.split())


def load_clean_csv(path="quarries.csv"):
    df = pd.read_csv(path, keep_default_na=False)

    for column in df.select_dtypes(include=["object"]).columns:
        df[column] = df[column].map(normalize_text)

    for column in TITLE_CASE_COLUMNS.intersection(df.columns):
        df[column] = df[column].map(lambda value: value.title() if isinstance(value, str) else value)

    return df


def build_database(csv_path="quarries.csv", db_path="LandQuarry.db"):
    df = load_clean_csv(csv_path)
    conn = sqlite3.connect(db_path)
    try:
        df.to_sql("quarries", conn, if_exists="replace", index=False)
        for column in INDEX_COLUMNS:
            if column in df.columns:
                conn.execute(f"CREATE INDEX IF NOT EXISTS idx_quarries_{column} ON quarries ({column})")
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    build_database()
    print("Database generated successfully!")
