CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    profile_image VARCHAR(500)
);
CREATE TABLE IF NOT EXISTS hobbies (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    hobby_description VARCHAR(50) NOT NULL,
    date_learned DATE NOT NULL
);
INSERT INTO users (username, password)
VALUES ('greg', 'admin');