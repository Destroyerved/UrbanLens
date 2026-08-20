import sqlite3

db = r"urbanlens.db"
con = sqlite3.connect(db)
j = con.execute(
    "SELECT cache_key, city, length(data), substr(source_signature,1,80) FROM json_cache"
).fetchall()
print("json_cache rows:", j if j else "MISSING")
lay = con.execute(
    "SELECT city, layer, length(data) FROM layers WHERE layer LIKE 'builtup_ghsl_%' ORDER BY layer"
).fetchall()
print("ghsl layer rows:", lay if lay else "MISSING")