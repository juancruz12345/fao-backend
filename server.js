
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@libsql/client');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

dotenv.config();

// Configuración de Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configuración del almacenamiento de Multer
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'news_images', // Carpeta en Cloudinary
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
  },
});

const upload = multer({ storage });


const app = express();
const PORT = process.env.PORT || 5000;

// Configuración de la base de datos
const db = createClient({ url: process.env.DB_URL, authToken: process.env.DB_TOKEN });

const ACCEPTED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173' // Incluye posibles variantes del origen
];



// Configuración de Middlewares
app.use(cors({
  origin: ACCEPTED_ORIGINS,
  credentials: true, // Permitir credenciales si usas cookies o tokens
}));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Crear tablas en la base de datos si no existen
(async () => {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS news (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        location TEXT NOT NULL,
        description TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS tournament (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        players INTEGER NOT NULL,
        rounds_amount INTEGER,
        location TEXT NOT NULL,
        description TEXT NOT NULL,
        date TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS rounds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL,
        round_number INTEGER NOT NULL,
        date DATE,
        results TEXT NOT NULL,
        FOREIGN KEY (tournament_id) REFERENCES tournament(id)
      );
    `);

    await db.execute(
   `CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      url TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      `
    );


    console.log('Tablas creadas (si no existían)');
  } catch (error) {
    console.error('Error al crear las tablas:', error);
  }
})();

// Ruta principal con formulario
app.get('/', (req, res) => {
  res.send(`
    <div>
      <div>
        <form action="/events" method="POST">
          <h1>Subir Evento</h1>
          <label>Título del Evento:</label><br>
          <input type="text" name="title" required><br>
          <label>Locación:</label><br>
          <input type="text" name="location" required><br>
          <label>Descripción:</label><br>
          <textarea name="description" required></textarea><br>
          <label>Fecha:</label><br>
          <input type="date" name="date" required><br>
          <label>Horario:</label><br>
          <input type="time" name="time" required><br>
          <button type="submit">Enviar</button>
        </form>
      </div>

      <div>
        <form action="/news" method="POST" enctype="multipart/form-data">
  <h1>Subir Noticia</h1>
  <label>Título de la noticia:</label><br>
  <input type="text" name="title" required><br>
  <label>Contenido:</label><br>
  <textarea name="content" required></textarea><br>
  <label>Imagen:</label><br>
  <input type="file" name="image" accept="image/*" required><br>
  <button type="submit">Enviar</button>
</form>

      </div>

      <div>
    <form action="/tournament" method="POST">
  <h1>Subir Torneo</h1>
  <label>Nombre del torneo:</label><br>
  <input type="text" name="title" required><br>
  <label>Cant.Jugadores:</label><br>
  <input type="number" name="players" required><br>
  <label>Cant. Rondas:</label><br>
  <input type="number" name="rounds_amount" required><br>
   <label>Locacion:</label><br>
  <input type="text" name="location" required><br>
  <label>Descripcion:</label><br>
  <textarea name="description" required></textarea><br>
   <label>Fecha:</label><br>
  <input type="date" name="date" required><br>
  <button type="submit">Enviar</button>
</form>

      </div>

      <div>
       <h1>Subir Imágenes</h1>
    <form action="/upload-images" method="POST" enctype="multipart/form-data">
        <div>
            <label for="images">Seleccionar imágenes:</label>
            <input type="file" name="images" id="images" multiple accept="image/*" required>
        </div>
        <div>
            <label for="title">Título:</label>
            <input type="text" name="title" id="title" placeholder="Título de las imágenes" required>
        </div>
       
        <button type="submit">Subir imágenes</button>
    </form>
      </div>
   
    </div>
  `);
})


app.post('/upload-images', upload.array('images', 50), async (req, res) => {
  try {
      const { title } = req.body
      const uploadedFiles = req.files

      if (!Array.isArray(uploadedFiles) || uploadedFiles.length === 0) {
          return res.status(400).json({ message: 'No se subieron imágenes.' })
      }
      if(!title){
        return res.status(400).send('le falta titulo pa!')
      }

      const uploadPromises = uploadedFiles.map((file) =>
          cloudinary.uploader.upload(file.path, {
              folder: 'news_images', // Carpeta en Cloudinary
              resource_type: 'image',
              quality: 'auto:low', // Comprime automáticamente con calidad baja
              format: 'webp', // Convierte las imágenes a formato WebP
          })
      )

      const results = await Promise.all(uploadPromises)

      // Guarda las URLs en la base de datos
      const queries = results.map((result) =>
          db.execute(
              'INSERT INTO images (title, url) VALUES (?, ?)',
              [title, result.secure_url]
          )
      );

      await Promise.all(queries)

      res.status(200).json({ message: 'Imágenes subidas y guardadas correctamente.' })
  } catch (error) {
      console.error(error)
      res.status(500).json({ message: 'Error al procesar las imágenes.' })
  }
})


app.post('/tournament', async(req,res)=>{

  const { title,players,rounds_amount, location, description, date } = req.body;
  

  if (!title || !players || !location || !description || !date) {
    return res.status(400).send('Título, locacion, descripcion y fecha son requeridos papu')
  }

  try {
    await db.execute(
      'INSERT INTO tournament (title, players, rounds_amount, location, description, date) VALUES (?, ?, ?, ?, ?, ?)',
      [title, players, rounds_amount, location, description, date]
    )
    res.status(201).send('Torneo agregado exitosamente')
  } catch (error) {
    console.error(error);
    res.status(500).send('Error al agregar el torneo')
  }
})

app.post('/tournament/rounds', async (req, res) => {

  

  const { tournamentId, round_number, results } = req.body



  if (!tournamentId || !round_number || !results) {

      return res.status(400).json({ message: 'Se requiere round_number y un array de resultados.' })

  }

  try {

      // Verificar que el torneo existe

      const tournament = await db.execute(`SELECT * FROM tournament WHERE id = ?`, [tournamentId])

      if (tournament.rows.length === 0) {

          return res.status(404).json({ message: 'Torneo no encontrado.' })

      }

      await db.execute(

          `INSERT INTO rounds (tournament_id, round_number, results) VALUES (?, ?, ?)`,

          [tournamentId, round_number, JSON.stringify(results)]

      )

      res.status(201).json({ message: 'Ronda creada con éxito.' })

  } catch (error) {

      console.error(error)

      res.status(500).json({ message: 'Error al crear la ronda.' })

  }

})

// Ruta para mostrar un formulario básico de carga de rondas

app.get('/form/rounds', (req, res) => {

  res.send(`

      <!DOCTYPE html>

      <html lang="en">

      <head>

          <meta charset="UTF-8">

          <meta name="viewport" content="width=device-width, initial-scale=1.0">

          <title>Cargar Rondas</title>

      </head>

      <body>

          <h1>Formulario para Cargar Rondas</h1>

          <form action="/tournament/rounds" method="POST">
             <label for="round_number">ID del torneo:</label>

              <input type="number" name="tournamentId" required>


              <label for="round_number">Número de Ronda:</label>

              <input type="number" id="round_number" name="round_number" required>

              <br><br>

              <label for="results">Resultados (separados por comas):</label>

              <input type="text" id="results" name="results" placeholder="Ejemplo: 1-0,0-1,1/2-1/2" required>

              <br><br>

              <button type="submit">Cargar Ronda</button>

          </form>

      </body>

      </html>

  `)

})



// Ruta para agregar noticias
app.post('/news', upload.single('image'), async (req, res) => {
  const { title, content } = req.body
  const image_url = req.file?.path // URL generada por Cloudinary

  if (!title || !content || !image_url) {
    return res.status(400).send('Título, contenido e imagen son obligatorios.')
  }

  try {
    await db.execute(
      'INSERT INTO news (title, content, image_url) VALUES (?, ?, ?)',
      [title, content, image_url]
    );
    res.status(201).send('Noticia agregada exitosamente')
  } catch (error) {
    console.error(error)
    res.status(500).send('Error al agregar la noticia')
  }
})




// Ruta para agregar eventos
app.post('/events', async (req, res) => {
  try {
    const { title, location, description, date, time } = req.body
    if (!title || !location || !description || !date || !time) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios.' })
    }

    await db.execute(
      'INSERT INTO events (title, location, description, date, time) VALUES (?, ?, ?, ?, ?)',
      [title, location, description, date, time]
    )

    res.status(201).json({ message: 'Evento agregado exitosamente.' })
  } catch (error) {
    console.error('Error al agregar evento:', error);
    res.status(500).json({ error: 'Error al agregar el evento.' })
  }
})

//Ruta para obtener imagenes
app.get('/images', async(req,res)=>{

  try{
    const imagenes = await db.execute('SELECT * FROM images')
    res.json(imagenes.rows)
  }catch(error){
    console.error('Error al obtener las imagenes:', error)
    res.status(500).json({ error: 'Error al obtener las imagenes.' })
  }

})

// Ruta para obtener noticias
app.get('/news', async (req, res) => {
  try {
    const noticias = await db.execute('SELECT * FROM news')
    res.json(noticias.rows)
  } catch (error) {
    console.error('Error al obtener noticias:', error)
    res.status(500).json({ error: 'Error al obtener las noticias.' })
  }
})

// Ruta para obtener eventos
app.get('/events', async (req, res) => {
  try {
    const eventos = await db.execute('SELECT * FROM events')
    res.json(eventos.rows)
  } catch (error) {
    console.error('Error al obtener eventos:', error)
    res.status(500).json({ error: 'Error al obtener los eventos.' })
  }
})

// Manejador de errores genérico
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err)
  res.status(500).json({ error: 'Algo salió mal en el servidor.' })
})

// Inicia el servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`)
})