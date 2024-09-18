CREATE TABLE city (
    id integer NOT NULL,
    name text NOT NULL,
    countrycode character(3) NOT NULL,
    district text NOT NULL,
    population integer NOT NULL
);

CREATE TABLE country (
    code character(3) NOT NULL,
    name text NOT NULL,
    continent text NOT NULL,
    region text NOT NULL,
    surfacearea real NOT NULL,
    indepyear smallint,
    population integer NOT NULL,
    lifeexpectancy real,
    gnp numeric(10,2),
    gnpold numeric(10,2),
    localname text NOT NULL,
    governmentform text NOT NULL,
    headofstate text,
    capital integer,
    code2 character(2) NOT NULL,
    CONSTRAINT country_continent_check CHECK ((((((((continent = 'Asia'::text) OR (continent = 'Europe'::text)) OR (continent = 'North America'::text)) OR (continent = 'Africa'::text)) OR (continent = 'Oceania'::text)) OR (continent = 'Antarctica'::text)) OR (continent = 'South America'::text)))
);

CREATE TABLE countrylanguage (
    countrycode character(3) NOT NULL,
    "language" text NOT NULL,
    isofficial boolean NOT NULL,
    percentage real NOT NULL
);

INSERT INTO city (id, name, countrycode, district, population) VALUES
(1, 'Tokyo', 'JPN', 'Kanto', 37400068),
(2, 'New York', 'USA', 'New York', 8175133),
(3, 'Los Angeles', 'USA', 'California', 3792621),
(4, 'Paris', 'FRA', 'Ile-de-France', 2140526),
(5, 'London', 'GBR', 'England', 8982000);

INSERT INTO country (code, name, continent, region, surfacearea, indepyear, population, lifeexpectancy, gnp, gnpold, localname, governmentform, headofstate, capital, code2) VALUES
('JPN', 'Japan', 'Asia', 'Eastern Asia', 377930.0, 660, 126476461, 84.6, 5064870.00, NULL, 'Nihon', 'Constitutional Monarchy', 'Naruhito', 1, 'JP'),
('USA', 'United States', 'North America', 'Northern America', 9833517.0, 1776, 331002651, 78.9, 21433226.00, NULL, 'United States', 'Federal Republic', 'Joe Biden', 2, 'US'),
('FRA', 'France', 'Europe', 'Western Europe', 551695.0, 843, 65273511, 82.4, 2715518.00, NULL, 'France', 'Republic', 'Emmanuel Macron', 4, 'FR'),
('GBR', 'United Kingdom', 'Europe', 'British Isles', 243610.0, 1066, 67886011, 81.2, 2825208.00, NULL, 'United Kingdom', 'Constitutional Monarchy', 'Elizabeth II', 5, 'GB');

INSERT INTO countrylanguage (countrycode, "language", isofficial, percentage) VALUES
('JPN', 'Japanese', TRUE, 99.2),
('USA', 'English', TRUE, 80.0),
('USA', 'Spanish', FALSE, 13.0),
('FRA', 'French', TRUE, 100.0),
('GBR', 'English', TRUE, 98.0);