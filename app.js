require("dotenv").config();
const express = require("express");
const passport = require("passport");
const session = require("express-session");
const { PrismaClient } = require("@prisma/client");
const PrismaStore = require("@quixo3/prisma-session-store").PrismaSessionStore;
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const prisma = new PrismaClient();

const uploadDir = "./uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new PrismaStore(prisma, {
      checkPeriod: 2 * 60 * 1000,
      dbRecordIdIsSessionId: true,
      dbRecordIdFunction: undefined,
    }),
  })
);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

passport.use(
  new LocalStrategy(
    { usernameField: "email" },
    async (email, password, done) => {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return done(null, false, { message: "Incorrect username" });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return done(null, false, { message: "Incorrect password" });

      return done(null, user);
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  const user = await prisma.user.findUnique({ where: { id } });
  done(null, user);
});

app.use(passport.initialize());
app.use(passport.session());

app.get("/", (req, res) => {
  res.send("🚀 File Uploader API is running!");
});

app.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return res.status(401).json({ message: info.message || "Login failed" });
    }
    req.logIn(user, (err) => {
      if (err) return next(err);
      return res.json({ message: "Login successful" });
    });
  })(req, res, next);
});

app.post("/register", async (req, res) => {
  const { email, password } = req.body;

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
    },
  });

  res.send("User registered successfully");
});

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

app.post("/upload", ensureAuthenticated, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const { originalname, filename, size } = req.file;
    const userId = req.user.id;

    const file = await prisma.file.create({
      data: {
        name: originalname,
        filename,
        size,
        url: `/uploads/${filename}`,
        userId,
      },
    });

    res.json({ message: "File uploaded successfully", file });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "File upload failed" });
  }
});

app.post("/folders", ensureAuthenticated, async (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.user.id;

    const folder = await prisma.folder.create({
      data: { name, userId },
    });

    res.json({ message: "Folder created successfully", folder });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error creating folder" });
  }
});

app.get("/folders", ensureAuthenticated, async (req, res) => {
  try {
    const folders = await prisma.folder.findMany({
      where: { userId: req.user.id },
      include: { files: true },
    });
    res.json(folders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching folders" });
  }
});

app.put("/folders/:id", ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const updatedFolder = await prisma.folder.update({
      where: { id, userId: req.user.id },
      data: { name },
    });

    res.json({ message: "Folder updated successfully", updatedFolder });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating folder" });
  }
});

app.delete("/folders/:id", ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    
    const files = await prisma.file.findMany({ where: { folderId: id } });
    if (files.length > 0) {
      return res.status(400).json({ message: "Cannot delete folder with files" });
    }

    await prisma.folder.delete({ where: { id, userId: req.user.id } });
    res.json({ message: "Folder deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error deleting folder" });
  }
});

app.get("/files/:id", ensureAuthenticated, async (req, res) => {
  try {
    const fileId = req.params.id;
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        name: true,
        filename: true,
        size: true,
        url: true,
        createdAt: true,
      },
    });

    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    res.json(file);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching file details" });
  }
});

app.put("/files/:fileId/folder/:folderId", ensureAuthenticated, async (req, res) => {
  try {
    const { fileId, folderId } = req.params;
    const userId = req.user.id;

    const file = await prisma.file.findUnique({
      where: { id: fileId, userId },
    });
    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    const folder = await prisma.folder.findUnique({
      where: { id: folderId, userId },
    });
    if (!folder) {
      return res.status(404).json({ message: "Folder not found" });
    }

    const updatedFile = await prisma.file.update({
      where: { id: fileId },
      data: { folderId },
    });

    res.json({ message: "File folder updated successfully", updatedFile });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating file folder" });
  }
});

app.get("/download/:id", ensureAuthenticated, async (req, res) => {
  try {
    const fileId = req.params.id;
    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    const filePath = path.join(__dirname, "uploads", file.filename);
    res.download(filePath, file.name);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error downloading file" });
  }
});


app.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    req.session.destroy((err) => {
      if (err) {
        return next(err);
      }
      res.clearCookie("connect.sid");
      res.redirect("/");
    });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});