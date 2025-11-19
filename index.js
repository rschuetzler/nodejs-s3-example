//npm install dotenv - explain
//npm install express-session - explain
//create the .env file

// Load environment variables from .env file into memory
// Allows you to use process.env
require('dotenv').config();

const express = require("express");

//Needed for the session variable - Stored on the server to hold data
const session = require("express-session");

let path = require("path");

const multer = require("multer");
const { S3Client } = require("@aws-sdk/client-s3");
const multerS3 = require("multer-s3");

// Allows you to read the body of incoming HTTP requests and makes that data available on req.body
let bodyParser = require("body-parser");

let app = express();

// Use EJS for the web pages - requires a views folder and all files are .ejs
app.set("view engine", "ejs");

// Root directory for static images
const uploadRoot = path.join(__dirname, "images");

// Sub-directory where uploaded profile pictures will be stored
const uploadDir = path.join(uploadRoot, "uploads");

// Check if we're in production mode
const isProduction = process.env.NODE_ENV === 'production';

// Configure storage based on environment
let storage;
let upload;

if (isProduction) {
    // Production: Use AWS S3
    // When running on Elastic Beanstalk with an IAM role (like LabRole),
    // the SDK automatically uses the role's credentials - no need to specify them
    const s3Client = new S3Client({
        region: process.env.AWS_REGION
    });

    storage = multerS3({
        s3: s3Client,
        bucket: process.env.AWS_S3_BUCKET_NAME,
        metadata: function (req, file, cb) {
            cb(null, { fieldName: file.fieldname });
        },
        key: function (req, file, cb) {
            // Generate a unique filename with timestamp to avoid collisions
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(file.originalname);
            const basename = path.basename(file.originalname, ext);
            cb(null, `uploads/${basename}-${uniqueSuffix}${ext}`);
        }
    });

    upload = multer({
        storage: storage,
        limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
    });

    console.log('Using S3 storage for file uploads');
} else {
    // Development: Use local disk storage
    storage = multer.diskStorage({
        // Save files into our uploads directory
        destination: (req, file, cb) => {
            cb(null, uploadDir);
        },
        // Reuse the original filename so users see familiar names
        filename: (req, file, cb) => {
            cb(null, file.originalname);
        }
    });

    upload = multer({ storage });

    // Expose everything in /images (including uploads) as static assets
    app.use("/images", express.static(uploadRoot));

    console.log('Using local disk storage for file uploads');
}

// process.env.PORT is when you deploy and 3001 is for test (3000 is often in use)
const port = process.env.PORT || 3001;

/* Session middleware (Middleware is code that runs between the time the request comes
to the server and the time the response is sent back. It allows you to intercept and
decide if the request should continue. It also allows you to parse the body request
from the html form, handle errors, check authentication, etc.)

REQUIRED parameters for session:
secret - The only truly required parameter
    Used to sign session cookies
    Prevents tampering and session hijacking with session data

OPTIONAL (with defaults):
resave - Default: true
    true = save session on every request
    false = only save if modified (recommended)

saveUninitialized - Default: true
    true = create session for every request
    false = only create when data is stored (recommended)
*/

app.use(
    session(
        {
    secret: process.env.SESSION_SECRET || 'fallback-secret-key',
    resave: false,
    saveUninitialized: false,
        }
    )
);

// Content Security Policy middleware - allows localhost connections for development
// This fixes the CSP violation error with Chrome DevTools
app.use((req, res, next) => {
    // Set a permissive CSP for development that allows localhost connections
    // This allows Chrome DevTools to connect to localhost:3000
    // In production, also allow images from S3
    const s3BucketUrl = isProduction && process.env.AWS_S3_BUCKET_NAME
        ? `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com `
        : '';

    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self' http://localhost:* ws://localhost:* wss://localhost:*; " +
        "connect-src 'self' http://localhost:* ws://localhost:* wss://localhost:*; " +
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
        `img-src 'self' data: https: ${s3BucketUrl}; ` +
        "font-src 'self' https://cdn.jsdelivr.net;"
    );
    next();
});

const knex = require("knex")({
    client: "pg",
    connection: {
        host : process.env.DB_HOST || "localhost",
        user : process.env.DB_USER || "postgres",
        password : process.env.DB_PASSWORD || "admin",
        database : process.env.DB_NAME || "foodisus",
        port : process.env.DB_PORT || 5432  // PostgreSQL 16 typically uses port 5434
    }
});

// Tells Express how to read form data sent in the body of a request
app.use(express.urlencoded({extended: true}));

// Global authentication middleware - runs on EVERY request
app.use((req, res, next) => {
    // Skip authentication for login routes
    if (req.path === '/' || req.path === '/login' || req.path === '/logout') {
        //continue with the request path
        return next();
    }
    
    // Check if user is logged in for all other routes
    if (req.session.isLoggedIn) {
        //notice no return because nothing below it
        next(); // User is logged in, continue
    } 
    else {
        res.render("login", { error_message: "Please log in to access this page" });
    }
});

// Main page route - notice it checks if they have logged in
app.get("/login", (req, res) => {
    // Check if user is logged in
    if (req.session.isLoggedIn) {        
        res.render("index");
    } 
    else {
        res.render("login", { error_message: "" });
    }
});

app.get("/test", (req, res) => {
    // Check if user is logged in
    if (req.session.isLoggedIn) {        
        res.render("test", {name : "BYU"});
    } 
    else {
        res.render("login", { error_message: "" });
    }
});

app.get("/users", (req, res) => {
    // Check if user is logged in
    if (req.session.isLoggedIn) { 
        knex.select().from("users")
            .then(users => {
                console.log(`Successfully retrieved ${users.length} users from database`);
                res.render("displayUsers", {users: users});
            })
            .catch((err) => {
                console.error("Database query error:", err.message);
                res.render("displayUsers", {
                    users: [],
                    error_message: `Database error: ${err.message}. Please check if the 'users' table exists.`
                });
            });
    } 
    else {
        res.render("login", { error_message: "" });
    }
});

app.get("/", (req, res) => {
    if (req.session.isLoggedIn) {
        res.render("index");
    } else {
        res.redirect("/login");
    }
});

// This creates attributes in the session object to keep track of user and if they logged in
app.post("/login", (req, res) => {
    let sName = req.body.username;
    let sPassword = req.body.password;
    
    knex.select("username", "password")
        .from('users')
        .where("username", sName)
        .andWhere("password", sPassword)
        .then(users => {
            // Check if a user was found with matching username AND password
            if (users.length > 0) {
                req.session.isLoggedIn = true;
                req.session.username = sName;
                res.redirect("/");
            } else {
                // No matching user found
                res.render("login", { error_message: "Invalid login" });
            }
        })
        .catch(err => {
            console.error("Login error:", err);
            res.render("login", { error_message: "Invalid login" });
        });   
});

// Logout route
app.get("/logout", (req, res) => {
    // Get rid of the session object
    req.session.destroy((err) => {
        if (err) {
            console.log(err);
        }
        res.redirect("/");
    });
});

app.get("/addUser", (req, res) => {
    res.render("addUser");
});    

app.post("/addUser", upload.single("profileImage"), (req, res) => {
    // Destructuring grabs them regardless of field order.
    //const username = req.body.username;
    //const password = req.body.password;

    const { username, password } = req.body;

    // Basic validation to ensure required fields are present.
    if (!username || !password) {
        return res.status(400).render("addUser", { error_message: "Username and password are required." });
    }

    // Build the path to the uploaded file
    // In production (S3): use the full S3 URL from req.file.location
    // In development (local): use the relative path
    let profileImagePath = null;
    if (req.file) {
        if (isProduction) {
            // S3 URL is provided by multer-s3 in the location property
            profileImagePath = req.file.location;
        } else {
            // Local file path
            profileImagePath = `/images/uploads/${req.file.filename}`;
        }
    }

    // Shape the data to match the users table schema.
    // Object literal - other languages use dictionaries
    // When the object is inserted with Knex, that value profileImagePath,
    // becomes the database column profile_image, so the saved path to
    // the uploaded image ends up in the profile_image column for that user.
    const newUser = {
        username,
        password,
        profile_image: profileImagePath
    };

    // Insert the record into PostgreSQL and return the user list on success.
    knex("users")
        .insert(newUser)
        .then(() => {
            res.redirect("/users");
        })
        .catch((dbErr) => {
            console.error("Error inserting user:", dbErr.message);
            // Database error, so show the form again with a generic message.
            res.status(500).render("addUser", { error_message: "Unable to save user. Please try again." });
        });
});  

app.get("/editUser/:id", (req, res) => {
    const userId = req.params.id;

    knex("users")
        .where({ id: userId })
        .first()
        .then((user) => {
            if (!user) {
                return res.status(404).render("displayUsers", {
                    users: [],
                    error_message: "User not found."
                });
            }

            res.render("editUser", { user, error_message: "" });
        })
        .catch((err) => {
            console.error("Error fetching user:", err.message);
            res.status(500).render("displayUsers", {
                users: [],
                error_message: "Unable to load user for editing."
            });
        });
});

app.post("/editUser/:id", upload.single("profileImage"), (req, res) => {
    const userId = req.params.id;
    const { username, password, existingImage } = req.body;

    if (!username || !password) {
        return knex("users")
            .where({ id: userId })
            .first()
            .then((user) => {
                if (!user) {
                    return res.status(404).render("displayUsers", {
                        users: [],
                        error_message: "User not found."
                    });
                }

                res.status(400).render("editUser", {
                    user,
                    error_message: "Username and password are required."
                });
            })
            .catch((err) => {
                console.error("Error fetching user:", err.message);
                res.status(500).render("displayUsers", {
                    users: [],
                    error_message: "Unable to load user for editing."
                });
            });
    }

    // Build the path to the uploaded file
    // In production (S3): use the full S3 URL from req.file.location
    // In development (local): use the relative path
    // If no new file, keep the existing image
    let profileImagePath;
    if (req.file) {
        if (isProduction) {
            // S3 URL is provided by multer-s3 in the location property
            profileImagePath = req.file.location;
        } else {
            // Local file path
            profileImagePath = `/images/uploads/${req.file.filename}`;
        }
    } else {
        // No new file uploaded, keep existing image
        profileImagePath = existingImage || null;
    }

    const updatedUser = {
        username,
        password,
        profile_image: profileImagePath
    };

    knex("users")
        .where({ id: userId })
        .update(updatedUser)
        .then((rowsUpdated) => {
            if (rowsUpdated === 0) {
                return res.status(404).render("displayUsers", {
                    users: [],
                    error_message: "User not found."
                });
            }

            res.redirect("/users");
        })
        .catch((err) => {
            console.error("Error updating user:", err.message);
            knex("users")
                .where({ id: userId })
                .first()
                .then((user) => {
                    if (!user) {
                        return res.status(404).render("displayUsers", {
                            users: [],
                            error_message: "User not found."
                        });
                    }

                    res.status(500).render("editUser", {
                        user,
                        error_message: "Unable to update user. Please try again."
                    });
                })
                .catch((fetchErr) => {
                    console.error("Error fetching user after update failure:", fetchErr.message);
                    res.status(500).render("displayUsers", {
                        users: [],
                        error_message: "Unable to update user."
                    });
                });
        });
});

app.get("/displayHobbies/:userId", (req, res) => {
    const userId = req.params.userId;

    knex("users")
        .where({ id: userId })
        .first()
        .then((user) => {
            if (!user) {
                return res.status(404).render("displayUsers", {
                    users: [],
                    error_message: "User not found."
                });
            }
            knex("hobbies")
                .where({ user_id: userId })
                .orderBy("id")
                .then((hobbies) => {
                    res.render("displayHobbies", {
                        user,
                        hobbies,
                        error_message: "",
                        success_message: ""
                    });
                })
                .catch((hobbyErr) => {
                    console.error("Error loading hobbies:", hobbyErr.message);
                    res.status(500).render("displayUsers", {
                        users: [],
                        error_message: "Unable to load hobbies."
                    });
                });
        })
        .catch((err) => {
            console.error("Error loading hobbies:", err.message);
            res.status(500).render("displayUsers", {
                users: [],
                error_message: "Unable to load hobbies."
            });
        });
});

app.get("/addHobbies/:userId", (req, res) => {
    const userId = req.params.userId;

    knex("users")
        .where({ id: userId })
        .first()
        .then((user) => {
            if (!user) {
                return res.status(404).render("displayUsers", {
                    users: [],
                    error_message: "User not found."
                });
            }
            res.render("addHobbies", {
                user,
                error_message: ""
            });
        })
        .catch((err) => {
            console.error("Error loading user:", err.message);
            res.status(500).render("displayUsers", {
                users: [],
                error_message: "Unable to load user."
            });
        });
});

app.post("/addHobbies/:userId", (req, res) => {
    const userId = req.params.userId;
    const hobby_description = (req.body.hobby_description || "").trim();
    const date_learned = req.body.date_learned;

    if (!hobby_description || !date_learned) {
        return knex("users")
            .where({ id: userId })
            .first()
            .then((user) => {
                if (!user) {
                    return res.status(404).render("displayUsers", {
                        users: [],
                        error_message: "User not found."
                    });
                }
                res.status(400).render("addHobbies", {
                    user,
                    error_message: "Hobby description and date learned are required."
                });
            })
            .catch((err) => {
                console.error("Error validating hobby:", err.message);
                res.status(500).render("displayUsers", {
                    users: [],
                    error_message: "Unable to add hobby."
                });
            });
    }

    knex("hobbies")
        .insert({ user_id: userId, hobby_description, date_learned })
        .then(() => {
            res.redirect(`/displayHobbies/${userId}`);
        })
        .catch((err) => {
            console.error("Error inserting hobby:", err.message);
            knex("users")
                .where({ id: userId })
                .first()
                .then((user) => {
                    if (!user) {
                        return res.status(404).render("displayUsers", {
                            users: [],
                            error_message: "User not found."
                        });
                    }
                    res.status(500).render("addHobbies", {
                        user,
                        error_message: "Unable to add hobby. Please try again."
                    });
                })
                .catch((userErr) => {
                    console.error("Error fetching user after hobby insert failure:", userErr.message);
                    res.status(500).render("displayUsers", {
                        users: [],
                        error_message: "Unable to add hobby."
                    });
                });
        });
});

app.post("/hobbies/:userId/delete/:hobbyId", (req, res) => {
    const { userId, hobbyId } = req.params;

    knex("hobbies")
        .where({ id: hobbyId, user_id: userId })
        .del()
        .then(() => {
            res.redirect(`/displayHobbies/${userId}`);
        })
        .catch((err) => {
            console.error("Error deleting hobby:", err.message);
            knex("users")
                .where({ id: userId })
                .first()
                .then((user) => {
                    if (!user) {
                        return res.status(404).render("displayUsers", {
                            users: [],
                            error_message: "User not found."
                        });
                    }
                    knex("hobbies")
                        .where({ user_id: userId })
                        .orderBy("id")
                        .then((hobbies) => {
                            res.status(500).render("displayHobbies", {
                                user,
                                hobbies,
                                error_message: "Unable to delete hobby. Please try again.",
                                success_message: ""
                            });
                        })
                        .catch((fetchErr) => {
                            console.error("Error fetching after delete failure:", fetchErr.message);
                            res.status(500).render("displayUsers", {
                                users: [],
                                error_message: "Unable to delete hobby."
                            });
                        });
                })
                .catch((userErr) => {
                    console.error("Error fetching user after delete failure:", userErr.message);
                    res.status(500).render("displayUsers", {
                        users: [],
                        error_message: "Unable to delete hobby."
                    });
                });
        });
});

app.post("/deleteUser/:id", (req, res) => {
    knex("users").where("id", req.params.id).del().then(users => {
        res.redirect("/users");
    }).catch(err => {
        console.log(err);
        res.status(500).json({err});
    })
});

app.listen(port, () => {
    console.log("The server is listening");
});