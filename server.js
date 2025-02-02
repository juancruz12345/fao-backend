
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@libsql/client');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const B2 = require('backblaze-b2');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

dotenv.config();


///BLACKBLAZE FOR PGN
const b2 = new B2({
  accountId: process.env.B2_ACCOUNT_ID,
  applicationKey: process.env.B2__APPLICATION_KEY,
})

const upload = multer({ dest: 'uploads/' })


////IMAGES
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
    transformation: [
      { width: 800, height: 600, crop: 'fit', quality: 'auto', fetch_format: 'webp' }, // Transformación para optimizar y convertir a WebP
    ],
  },
})

const uploadImages = multer({ storage });

const app = express();
const PORT = process.env.PORT || 5000;

// Configuración de la base de datos
const db = createClient({ url: process.env.DB_URL, authToken: process.env.DB_TOKEN });

const ACCEPTED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://localhost:5173',
  'https://federacionajedrezolavarria.onrender.com' // Incluye posibles variantes del origen
];



// Configuración de Middlewares
app.use(cors({
  origin: ACCEPTED_ORIGINS,
  credentials: true, // Permitir credenciales si usas cookies o tokens
}));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));


app.post("/analyze", async (req, res) => {
  const { fen, depth } = req.body;

  if (!fen || !depth) {
    return res.status(400).json({ error: "FEN y depth son requeridos" });
  }

  try {
    const response = await axios.post("https://stockfish.online/api/v2/analyze", {
      fen: fen,
      depth: depth,
    });

    res.json(response.data);
  } catch (error) {
    console.error("Error en el backend:", error.response ? error.response.data : error.message);
    res.status(500).json({ error: "Error al analizar la posición" });
  }
});


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
        type TEXT,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    mode TEXT,
    location TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE
);
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL,
    round_number INTEGER NOT NULL,
    FOREIGN KEY (tournament_id) REFERENCES tournaments (id)
);
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id INTEGER NOT NULL,
    player1_id INTEGER NOT NULL,
    player2_id INTEGER NOT NULL,
    result TEXT NOT NULL, 
    pgn TEXT, 
    link TEXT, 
    FOREIGN KEY (round_id) REFERENCES rounds (id),
    FOREIGN KEY (player1_id) REFERENCES players (id),
    FOREIGN KEY (player2_id) REFERENCES players (id)
);
    `);

    await db.execute(
   `CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      album TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      `
    );
   await db.execute( `CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    club TEXT,
    category TEXT,
    rating INTEGER,
    elo TEXT,
    id_fide TEXT
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
    <!DOCTYPE html>
      <html lang="es">
      <head>
      <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Formularios</title>
    <link rel="stylesheet" href="styles.css">
      </head>
    <body>
      <div>
      <div class='div-form'>
        <form action="/events" method="POST">
          <h1>Subir Evento</h1>
          <label>Título del Evento:</label><br>
          <input type="text" name="title" required><br>
          <label>Locación:</label><br>
          <input type="text" name="location" required><br>
          <label>Descripción:</label><br>
          <textarea name="description" required></textarea><br>
          <label>Tipo de evento:</label><br>
          <textarea name="type"></textarea><br>
          <label>Fecha:</label><br>
          <input type="date" name="date" required><br>
          <label>Horario:</label><br>
          <input type="time" name="time" required><br>
          <button type="submit">Enviar</button>
        </form>
      </form>
 <form id='update-form-event' method="PUT">
  <h1>Actualizar Evento</h1>
          <label>ID del Evento:</label><br>
          <input type="text" name="id" id="event-id" required><br>
          <label>Título del Evento:</label><br>
          <input type="text" name="title" id="event-title" ><br>
          <label>Locación:</label><br>
          <input type="text" name="location" id="event-location" ><br>
          <label>Descripción:</label><br>
          <textarea name="description" id="event-description"></textarea><br>
          <label>Tipo de evento:</label><br>
          <input name="type" id="event-type"><br>
          <label>Fecha:</label><br>
          <input type="date" name="date" id="event-date" ><br>
          <label>Horario:</label><br>
          <input type="time" name="time" id="event-time" ><br>
          <button type="submit">Actualizar</button>
</form>
<form id="deleteForm-event">
    <label for="id">ID del Evento a Eliminar:</label>
    <input type="number" id="id-event-delete" name="id" required>
    <button type="submit">Eliminar Evento</button>
  </form>
  <script>
          document.getElementById('deleteForm-event').addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('id-event-delete').value;
            if (id) {
            try {
                // Aquí debes usar el template string correctamente
                const response = await fetch(\`/event/\${id}\`, {
                  method: 'DELETE',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                });

                const result = await response.json();
                console.log(response)
                if (response.ok) {
                  alert(result.message);
                } else {
                  alert('Error: ' + result.error);
                }
              } catch (error) {
                console.error('Error:', error);
                alert('Error al eliminar jugador.');
              }
            }
          });
  </script>
 <script>
          document.getElementById('update-form-event').addEventListener('submit', async (e) => {
            e.preventDefault();

            const id = document.getElementById('event-id').value;
            const title = document.getElementById('event-title').value;
            const location = document.getElementById('event-location').value;
            const description = document.getElementById('event-description').value;
            const type = document.getElementById('event-type').value;
            const date = document.getElementById('event-date').value;
            const time = document.getElementById('event-time').value;

            if (id) {
         
              try {
               
                const response = await fetch(\`/events/\${id}\`, {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ title, location, description, type, date, time }),
                });

                const result = await response.json();
                console.log(result)
                if (response.ok) {
                  alert(result.message);
                } else {
                  alert('Error: ' + result.error);
                }
              } catch (error) {
                console.error('Error:', error);
                alert('Error al actualizar el evento.');
              }
            }
          });
        </script>
      </div>

      <div class='div-form'>
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

<form id="deleteForm-news">
    <label for="id">ID de la noticia a Eliminar:</label>
    <input type="number" id="id-news" name="id" required>
    <button type="submit">Eliminar Noticia</button>
  </form>

<script>
          document.getElementById('deleteForm-news').addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('id-news').value;
            if (id) {
            try {
               
                const response = await fetch(\`/news/\${id}\`, {
                  method: 'DELETE',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                });

                const result = await response.json();
                console.log(result)
                if (response.ok) {
                  alert(result.message);
                } else {
                  alert('Error: ' + result.error);
                }
              } catch (error) {
                console.error('Error:', error);
                alert('Error al eliminar noticia.');
              }
            }
          });
        </script>
      </div>



       <div class='div-form'>
    <form action="/players" method="POST">
  <h1>Subir Jugador</h1>
  <label>Nombre y apellido del jugador:</label><br>
  <input type="text" name="name" required><br>
   <label>Club:</label><br>
  <input type="text" name="club" ><br>
  <label>Categoria:</label><br>
  <input type="text" name="category" ><br>
   <label>Rating:</label><br>
  <input type="text" name="rating"><br>
  <label>Elo:</label><br>
  <input type="text" name="elo"><br>
  <label>ID Fide:</label><br>
  <input type="text" name="id_fide"><br>
  <button type="submit">Enviar</button>
</form>
 <form id='update-form-player' method="PUT">
  <h1>Actualizar Jugador</h1>
   <label>ID del jugador:</label><br>
  <input type="text" name="id" id="id-player" required><br>
  <label>Nombre y apellido del jugador:</label><br>
  <input type="text" name="name" id="name-player"><br>
   <label>Club:</label><br>
  <input type="text" name="club" id="club-player" ><br>
  <label>Categoria:</label><br>
  <input type="text" name="category" id="category-player" ><br>
   <label>Rating:</label><br>
  <input type="text" name="rating" id="rating-player"><br>
  <label>Elo:</label><br>
  <input type="text" name="elo" id="elo-player"><br>
  <label>ID Fide:</label><br>
  <input type="text" name="id_fide" id="id-fide-player"><br>
  <button type="submit">Enviar</button>
</form>
<form id="deleteForm-player">
    <label for="id">ID del Jugador a Eliminar:</label>
    <input type="number" id="id-player-delete" name="id" required>
    <button type="submit">Eliminar Jugador</button>
  </form>
  <script>
          document.getElementById('deleteForm-player').addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('id-player-delete').value;
            if (id) {
            try {
                
                const response = await fetch(\`/player/\${id}\`, {
                  method: 'DELETE',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                });

                const result = await response.json();
                console.log(response)
                if (response.ok) {
                  alert(result.message);
                } else {
                  alert('Error: ' + result.error);
                }
              } catch (error) {
                console.error('Error:', error);
                alert('Error al eliminar jugador.');
              }
            }
          });
  </script>
 <script>
          document.getElementById('update-form-player').addEventListener('submit', async (e) => {
            e.preventDefault();

            const id = document.getElementById('id-player').value;
            const name = document.getElementById('name-player').value;
            const club = document.getElementById('club-player').value;
            const category = document.getElementById('category-player').value;
            const rating = document.getElementById('rating-player').value;
            const elo = document.getElementById('elo-player').value;
            const id_fide = document.getElementById('id-fide-player').value;

            if (id) {
            console.log('name:', name);  // Verifica el valor de 'name'
            console.log('club:', club); 
            console.log('category:', category); 
            console.log('rating:', club); 
              try {
                
                const response = await fetch(\`/players/\${id}\`, {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ name, club, category, rating, elo, id_fide }),
                });

                const result = await response.json();
                console.log(result)
                if (response.ok) {
                  alert(result.message);
                } else {
                  alert('Error: ' + result.error);
                }
              } catch (error) {
                console.error('Error:', error);
                alert('Error al actualizar el jugador.');
              }
            }
          });
        </script>
      </div>

      <div class="div-form">
    <form action="/tournaments" method="POST">
  <h1>Subir Torneo</h1>
  <label>Nombre del torneo:</label><br>
  <input type="text" name="name" required><br>
  <label>Modalidad del torneo:</label><br>
  <input type="text" name="mode" required><br>
   <label>Locacion:</label><br>
  <input type="text" name="location" required><br>
   <label>Fecha de inicio:</label><br>
  <input type="date" name="start_date" required><br>
  <label>Fecha de culminacion:</label><br>
  <input type="date" name="end_date"><br>
  <button type="submit">Enviar</button>
</form>
<form id="deleteForm-tournament">
    <label for="id">ID del Evento a Eliminar:</label>
    <input type="number" id="id-tournament-delete" name="id" required>
    <button type="submit">Eliminar Torneo</button>
  </form>
  <script>
          document.getElementById('deleteForm-tournament').addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('id-tournament-delete').value;
            if (id) {
            try {
               
                const response = await fetch(\`/tournament/\${id}\`, {
                  method: 'DELETE',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                });

                const result = await response.json();
                console.log(response)
                if (response.ok) {
                  alert(result.message);
                } else {
                  alert('Error: ' + result.error);
                }
              } catch (error) {
                console.error('Error:', error);
                alert('Error al eliminar Torneo.');
              }
            }
          });
  </script>

      </div>

        <div class="div-form">
    <form action="/rounds" method="POST">
  <h1>Subir Ronda</h1>
  <label>ID del torneo:</label><br>
  <input type="text" name="tournament_id" required><br>
   <label>Numero de ronda:</label><br>
  <input type="text" name="round_number" required><br>
  <button type="submit">Enviar</button>
</form>
<form id="deleteForm-round">
    <label for="id">ID de la ronda a Eliminar:</label>
    <input type="number" id="id-round-delete" name="id" required>
    <button type="submit">Eliminar Ronda</button>
  </form>
  <script>
          document.getElementById('deleteForm-round').addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('id-round-delete').value;
            if (id) {
            try {
                
                const response = await fetch(\`/round/\${id}\`, {
                  method: 'DELETE',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                });

                const result = await response.json();
                console.log(response)
                if (response.ok) {
                  alert(result.message);
                } else {
                  alert('Error: ' + result.error);
                }
              } catch (error) {
                console.error('Error:', error);
                alert('Error al eliminar jugador.');
              }
            }
          });
  </script>

      </div>

         <div class="div-form">
    <form action="/matches" method="POST" enctype="multipart/form-data">
  <h1>Subir Match</h1>
  <label>ID de la ronda:</label><br>
  <input type="text" name="round_id" required><br>
   <label>ID jugador 1:</label><br>
  <input type="text" name="player1_id" required><br>
   <label>ID jugador 2:</label><br>
  <input type="text" name="player2_id" required><br>
   <label>Resultado:</label><br>
  <input type="text" name="result" required><br>
  <label for="pgnFile">PGN File:</label>
  <input type="file" id="pgnFile" name="pgnFile" accept=".pgn" /><br>
  <label>Link de la partida:</label><br>
  <input type="text" name="link"><br>
  <button type="submit">Enviar</button>
</form>
<form id="deleteForm-match">
    <label for="id">ID del match a Eliminar:</label>
    <input type="number" id="id-match-delete" name="id" required>
    <button type="submit">Eliminar Match</button>
  </form>
  <script>
          document.getElementById('deleteForm-match').addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('id-match-delete').value;
            if (id) {
            try {
                
                const response = await fetch(\`/match/\${id}\`, {
                  method: 'DELETE',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                });

                const result = await response.json();
                console.log(response)
                if (response.ok) {
                  alert(result.message);
                } else {
                  alert('Error: ' + result.error);
                }
              } catch (error) {
                console.error('Error:', error);
                alert('Error al eliminar match.');
              }
            }
          });
  </script>

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
             <label for="title">Título del Album:</label>
            <input type="text" name="album" id="title" placeholder="Título del album" required>
        </div>
       
        <button type="submit">Subir imágenes</button>
    </form>
      </div>
   
    </div>
    </body>
    
    
    </html>
    `
  )
})


///////////////////////////////-------SETTERS-----------------------///////////////////////////////

app.post('/upload-images', uploadImages.array('images', 50), async (req, res) => {
  try {
      const { title, album } = req.body
      const uploadedFiles = req.files

      if (!Array.isArray(uploadedFiles) || uploadedFiles.length === 0) {
          return res.status(400).json({ message: 'No se subieron imágenes.' })
      }
      if(!title || !album){
        return res.status(400).send('le falta titulo  o titulo del album paparulo!')
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
              'INSERT INTO images (title, album, url) VALUES (?, ?, ?)',
              [title,album, result.secure_url]
          )
      );

      await Promise.all(queries)

      res.status(200).json({ message: 'Imágenes subidas y guardadas correctamente.' })
  } catch (error) {
      console.error(error)
      res.status(500).json({ message: 'Error al procesar las imágenes.' })
  }
})

app.post('/players', async(req,res)=>{

  const {name,club,category, rating,elo, id_fide} = req.body
  
  if (!name || !rating) {
    return res.status(400).send('Nombre y rating son requeridos papulince')
  }
  try {
    await db.execute(
      'INSERT INTO players (name, club, category, rating, elo, id_fide) VALUES (?, ?, ?, ?, ?, ?)',
      [name,club,category, rating,elo, id_fide]
    )
    res.status(201).send('Jugador agregado exitosamente')
  } catch (error) {
    console.error(error);
    res.status(500).send('Error al agregar el jugador')
  }

})

app.post('/tournaments', async(req,res)=>{

  const { name,mode,location, start_date, end_date } = req.body
  

  if (!name || !mode || !location || !start_date) {
    return res.status(400).send('Título, locacion y fecha de inicio son requeridos papu')
  }

  try {
    await db.execute(
      'INSERT INTO tournaments (name, mode, location, start_date, end_date) VALUES (?, ?, ?, ?, ?)',
      [name, mode, location,start_date, end_date]
    )
    res.status(201).send('Torneo agregado exitosamente')
  } catch (error) {
    console.error(error);
    res.status(500).send('Error al agregar el torneo')
  }
})

app.post('/rounds', async(req,res)=>{

  const {tournament_id, round_number} = req.body

  if (!tournament_id || !round_number) {
    return res.status(400).send('id de torneo y numero de ronda son requeridos papino')
  }
  
  try {
    await db.execute(
      'INSERT INTO rounds (tournament_id, round_number) VALUES (?, ?)',
      [tournament_id, round_number]
    )
    res.status(201).send('Ronda agregado exitosamente')
  } catch (error) {
    console.error(error)
    res.status(500).send('Error al agregar ronda')
  }

})

app.post('/matches',upload.single('pgnFile'), async(req,res)=>{
 
  const {round_id, player1_id, player2_id, result, link} = req.body
  const filePath = req?.file?.path
  const fileName = req?.file?.originalname
  
  if (!round_id || !player1_id || !player2_id || !result) {
    return res.status(400).send('ID de la ronda, de los jugadores y el resultado son requeridos papulince')
  }
  
  try {

     if(filePath && fileName){
      // Autorizar con B2
     await b2.authorize();

     const fileData = await fs.readFile(filePath);

     // Subir el archivo a Backblaze B2
     const uploadUrlResponse = await b2.getUploadUrl({
       bucketId: process.env.B2_BUCKET_ID,
     })
 
     const uploadResponse = await b2.uploadFile({
       uploadUrl: uploadUrlResponse.data.uploadUrl,
       uploadAuthToken: uploadUrlResponse.data.authorizationToken,
       fileName: `matches/${fileName}`, // Guardar en una carpeta específica en el bucket
       data: fileData, // Leer archivo desde el sistema
     })
 
     // Obtener URL pública del archivo
     const publicFileUrl = `https://f005.backblazeb2.com/file/FAO-pgn/matches/${fileName}`

    await db.execute(
      'INSERT INTO matches (round_id, player1_id,  player2_id, result, pgn, link) VALUES (?, ?, ?, ?, ?, ?)',
      [round_id, player1_id, player2_id, result, publicFileUrl, link]
    )

    await fs.unlink(filePath);
    res.status(201).send('Match agregado exitosamente')
     }
     else{
      await db.execute(
        'INSERT INTO matches (round_id, player1_id,  player2_id, result, link) VALUES (?, ?, ?, ?, ?)',
        [round_id, player1_id, player2_id, result, link]
      )
      res.status(201).send('Match agregado exitosamente')
     }
    
  } catch (error) {
    console.error(error)
    res.status(500).send('Error al agregar el Match')
  }

})





app.post('/news', uploadImages.single('image'), async (req, res) => {
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
    const { title, location, description,type, date, time } = req.body
    if (!title || !location || !description || !date || !time) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios.' })
    }

    await db.execute(
      'INSERT INTO events (title, location, description, type, date, time) VALUES (?, ?, ?, ?, ?, ?)',
      [title, location, description,type, date, time]
    )

    res.status(201).json({ message: 'Evento agregado exitosamente.' })
  } catch (error) {
    console.error('Error al agregar evento:', error);
    res.status(500).json({ error: 'Error al agregar el evento.' })
  }
})









///////////////////////////////-------GETTERS-----------------------///////////////////////////////

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
    const { offset = 0, limit = 10 } = req.query;

    if (isNaN(offset) || isNaN(limit)) {
      return res.status(400).json({ error: 'Invalid query parameters' });
    }

    const query = 'SELECT * FROM news ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const params = [parseInt(limit), parseInt(offset)];
    const result = await db.execute(query, params);
    
    res.status(200).json({
      data: result.rows,
      offset: parseInt(offset),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error("Error in /news route:", error); // Agregar log detallado
    res.status(500).json({ error: 'Error fetching news' });
  }
});



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

app.get('/tournaments', async(req,res)=>{
  try {
    const torneos = await db.execute('SELECT * FROM tournaments')
    res.json(torneos.rows)
  } catch (error) {
    console.error('Error al obtener torneos:', error)
    res.status(500).json({ error: 'Error al obtener los torneos.' })
  }
})
app.get('/rounds', async(req,res)=>{
  try {
    const rounds = await db.execute('SELECT * FROM rounds')
    res.json(rounds.rows)
  } catch (error) {
    console.error('Error al obtener rounds:', error)
    res.status(500).json({ error: 'Error al obtener los rounds.' })
  }
})
app.get('/matches', async (req, res) => {
  try {
    const query = `
      SELECT 
        matches.*, 
        tournaments.name AS tournament_name, 
        tournaments.start_date AS tournament_start_date
      FROM 
        matches
      INNER JOIN 
        rounds ON matches.round_id = rounds.id
      INNER JOIN 
        tournaments ON rounds.tournament_id = tournaments.id
    `;
    
    const matches = await db.execute(query);
    res.json(matches.rows);
  } catch (error) {
    console.error('Error al obtener matches:', error);
    res.status(500).json({ error: 'Error al obtener los matches.' });
  }
});


app.get('/tournaments/all', async (req, res) => {
  try {
    const allData = await db.execute(`
      SELECT 
        tournaments.id AS tournament_id,
        tournaments.name AS tournament_name,
        tournaments.location AS tournament_location,
        tournaments.mode AS tournament_mode,
        tournaments.start_date AS tournament_start_date,
        rounds.round_number AS round_number,
        matches.player1_id AS player1_id,
        matches.player2_id AS player2_id,
        matches.result AS match_result,
        matches.pgn AS match_pgn,
        matches.link AS match_link
      FROM tournaments
      LEFT JOIN rounds ON tournaments.id = rounds.tournament_id
      LEFT JOIN matches ON rounds.id = matches.round_id
    `);

    const rows = allData.rows;

    // Estructurar los datos
    const structuredData = rows.reduce((acc, row) => {
      // Buscar o crear el torneo
      let tournament = acc.find(t => t.id === row.tournament_id);
      if (!tournament) {
        tournament = {
          id: row.tournament_id,
          name: row.tournament_name,
          location: row.tournament_location,
          mode:row.tournament_mode,
          start_date:row.tournament_start_date,
          rounds: [],
        };
        acc.push(tournament);
      }

      // Buscar o crear la ronda dentro del torneo
      if (row.round_number) {
        let round = tournament.rounds.find(r => r.number === row.round_number);
        if (!round) {
          round = {
            number: row.round_number,
            matches: [],
          };
          tournament.rounds.push(round);
        }

        // Agregar match a la ronda
        if (row.player1_id) {
          round.matches.push({
            player1_id: row.player1_id,
            player2_id: row.player2_id,
            result: row.match_result,
            pgn: row.match_pgn,
            link: row.match_link,
          })
        }
      }

      return acc
    }, []);

    res.json(structuredData);
  } catch (error) {
    console.error('Error al estructurar los datos:', error);
    res.status(500).json({ error: 'Error al estructurar los datos.' });
  }
});


app.get('/players', async(req,res)=>{
  try {
    const players = await db.execute('SELECT * FROM players')
    res.json(players.rows)
  } catch (error) {
    console.error('Error al obtener players:', error)
    res.status(500).json({ error: 'Error al obtener los players.' })
  }
})

app.get('/tournament/:id', async (req, res) => {
  const { id } = req.params;
  const query = `
    SELECT 
      t.id AS tournament_id, 
      t.name AS tournament_name,
      r.id AS round_id,
      r.round_number AS round_number,
      m.id AS match_id,
      m.player1_id,
      m.player2_id,
      m.result
    FROM tournaments t
    LEFT JOIN rounds r ON t.id = r.tournament_id
    LEFT JOIN matches m ON r.id = m.round_id
    WHERE t.id = ?
  `;

  try {
    const rows = await db.execute(query, [id]);
    console.log(rows.rows)
    // Procesar datos para estructurar el resultado
    const tournamentData = {
      id: id,
      name: rows.rows[0].tournament_name || null,
      rounds: [],
    };

    const roundMap = new Map();

    rows.rows.forEach(row => {
      if (!roundMap.has(row.round_id) && row.round_id) {
        roundMap.set(row.round_id, {
          id: row.round_id,
          round_number: row.round_number,
          matches: [],
        });
        tournamentData.rounds.push(roundMap.get(row.round_id));
      }

      if (row.match_id) {
        roundMap.get(row.round_id)?.matches.push({
          id: row.match_id,
          player1_id: row.player1_id,
          player2_id: row.player2_id,
          result:row.result
        });
      }
    });

    res.json(tournamentData);
  } catch (error) {
    console.error('Error fetching tournament data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.get('/tournament/:id/standings', async(req,res)=>{
  const { id } = req.params;

    try {
       
      const standings = await db.execute(
        `
            SELECT 
                p.id AS player_id,
                p.name AS player_name,
                SUM(CASE 
                    WHEN m.result = '1-0' AND m.player1_id = p.id THEN 1
                    WHEN m.result = '0-1' AND m.player2_id = p.id THEN 1
                    WHEN m.result = '1/2-1/2' THEN 0.5
                    ELSE 0 
                END) AS points
            FROM players p
            LEFT JOIN matches m 
                ON p.id = m.player1_id OR p.id = m.player2_id
            LEFT JOIN rounds r
                ON r.id = m.round_id
            WHERE r.tournament_id = ?
            GROUP BY p.id, p.name
            ORDER BY points DESC;
        `
        ,
        [id]
      )


        if (!standings) {
            return res.status(404).json({ message: 'No se encontró el torneo o no hay datos disponibles.' });
        }

        // Responder con la clasificación
        res.json(standings.rows);
    } catch (error) {
        console.error('Error al obtener la clasificación:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
})

app.get('/player/:id/matches', async (req, res) => {
  const { id } = req.params;

  try {
      const query = `
          SELECT 
              m.id AS match_id,
              t.name AS tournament_name,
              r.round_number,
              p1.name AS player1_name,
              p2.name AS player2_name,
              m.result,
              m.pgn,
              m.link,
              t.start_date AS tournament_start_date,
              t.end_date AS tournament_end_date
          FROM matches m
          JOIN rounds r ON m.round_id = r.id
          JOIN tournaments t ON r.tournament_id = t.id
          JOIN players p1 ON m.player1_id = p1.id
          JOIN players p2 ON m.player2_id = p2.id
          WHERE m.player1_id = ? OR m.player2_id = ?
          ORDER BY t.start_date, r.round_number;
      `;
     
      const result = await db.execute(query, [id, id]);

      const matches = result.rows.map(row => ({
          match_id: row[0],
          tournament_name: row[1],
          round_number: row[2],
          player1_name: row[3],
          player2_name: row[4],
          result: row[5],
          pgn:row[6],
          link:row[7],
          tournament_start_date: row[8],
          tournament_end_date: row[9]
       
      }))

      

      res.json({ matches})
  } catch (error) {
      console.error('Error al obtener las partidas del jugador:', error)
      res.status(500).json({ message: 'Error interno del servidor.' })
  }
})









///////////////////////////////-------PUT-----------------------///////////////////////////////

// Ruta para actualizar un jugador en la tabla players
app.put('/players/:id', async (req, res) => {
  const {id} = req?.params
  const { name, club, category, rating, elo, id_fide } = req?.body
  const fieldsToUpdate = []
  const values = []
  
  // Si los campos están presentes, agregarlos a la consulta
  if (name) {
    fieldsToUpdate.push('name = ?')
    values.push(name)
  }
  if (club) {
    fieldsToUpdate.push('club = ?')
    values.push(club)
  }
  if (category) {
    fieldsToUpdate.push('category = ?')
    values.push(category)
  }
  if (rating) {
    fieldsToUpdate.push('rating = ?')
    values.push(rating)
  }
  if (elo) {
    fieldsToUpdate.push('elo = ?')
    values.push(elo)
  }
  if (id_fide) {
    fieldsToUpdate.push('id_fide = ?')
    values.push(id_fide)
  }
  
  // Asegurarse de que al menos un campo esté para actualizar
  if (fieldsToUpdate.length === 0) {
    return res.status(400).json({ message: 'No se han proporcionado campos para actualizar' })
  }
  
  // Crear la consulta dinámica
  const query = `UPDATE players SET ${fieldsToUpdate.join(', ')} WHERE id = ?`
  values.push(id)
  
  // Ejecutar la consulta
  try {
    await db.execute(query, values)
    res.status(200).json({ message: 'Jugador actualizado correctamente.' })
  } catch (error) {
    console.error('Error al actualizar el jugador:', error);
    res.status(500).json({ message: 'Error interno del servidor.' })
  }

})

app.put('/events/:id', async (req, res) => {
  const {id} = req?.params
  const { title, location, description, type, date, time } = req?.body
  const fieldsToUpdate = []
  const values = []
  
  
  if (title) {
    fieldsToUpdate.push('title = ?')
    values.push(title)
  }
  if (location) {
    fieldsToUpdate.push('location = ?')
    values.push(location)
  }
  if (description) {
    fieldsToUpdate.push('description = ?')
    values.push(description)
  }
  if (type) {
    fieldsToUpdate.push('type = ?')
    values.push(type)
  }
  if (date) {
    fieldsToUpdate.push('date = ?')
    values.push(date)
  }
  if (time) {
    fieldsToUpdate.push('time = ?')
    values.push(time)
  }
  
  
  if (fieldsToUpdate.length === 0) {
    return res.status(400).json({ message: 'No se han proporcionado campos para actualizar' })
  }
  
  
  const query = `UPDATE events SET ${fieldsToUpdate.join(', ')} WHERE id = ?`
  values.push(id)
 
  try {
    await db.execute(query, values)
    res.status(200).json({ message: 'Evento actualizado correctamente.' })
  } catch (error) {
    console.error('Error al actualizar el Evento:', error)
    res.status(500).json({ message: 'Error interno del servidor.' })
  }

})









////////////---------------------------DELETE--------------------------////////////////




app.delete('/news/:id', async(req, res) => {
  const { id } = req.params
  if(!id){
   
    return res.status(400).json({ message: 'No se han proporcionado un id' })
    
  }
  const query = `DELETE FROM news WHERE id = ?`

  try {
    await db.execute(query, [id])
    res.status(200).json({ message: 'Noticia eliminada correctamente.' })
  } catch (error) {
    console.error('Error al eliminar la noticia:', error);
    res.status(500).json({ message: 'Error interno del servidor.' })
  }
})


app.delete('/player/:id', async(req, res) => {
  const { id } = req.params;
  if(!id){
   
    return res.status(400).json({ message: 'No se han proporcionado un id' })
    
  }
  const query = `DELETE FROM players WHERE id = ?`

  try {
    await db.execute(query, [id]);
    res.status(200).json({ message: 'Jugador eliminado correctamente.' })
  } catch (error) {
    console.error('Error al eliminar la noticia:', error);
    res.status(500).json({ message: 'Error interno del servidor.' })
  }
})

app.delete('/event/:id', async(req, res) => {
  const { id } = req.params
  if(!id){
   
    return res.status(400).json({ message: 'No se han proporcionado un id' })
    
  }
  const query = `DELETE FROM events WHERE id = ?`

  try {
    await db.execute(query, [id]);
    res.status(200).json({ message: 'Evento eliminado correctamente.' })
  } catch (error) {
    console.error('Error al eliminar Evento:', error)
    res.status(500).json({ message: 'Error interno del servidor.' })
  }
})

app.delete('/tournament/:id', async(req, res) => {
  const { id } = req.params;
  if(!id){
   
    return res.status(400).json({ message: 'No se han proporcionado un id' })
    
  }
  const query = `DELETE FROM tournaments WHERE id = ?`

  try {
    await db.execute(query, [id])
    res.status(200).json({ message: 'Torneo eliminado correctamente.' })
  } catch (error) {
    console.error('Error al eliminar Torneo:', error);
    res.status(500).json({ message: 'Error interno del servidor.' })
  }
})

app.delete('/round/:id', async(req, res) => {
  const { id } = req.params
  if(!id){
   
    return res.status(400).json({ message: 'No se han proporcionado un id' })
    
  }
  const query = `DELETE FROM rounds WHERE id = ?`

  try {
    await db.execute(query, [id])
    res.status(200).json({ message: 'Ronda eliminado correctamente.' })
  } catch (error) {
    console.error('Error al eliminar Ronda:', error)
    res.status(500).json({ message: 'Error interno del servidor.' })
  }
})


app.delete('/match/:id', async(req, res) => {
  const { id } = req.params
  if(!id){
   
    return res.status(400).json({ message: 'No se han proporcionado un id' })
    
  }
  const query = `DELETE FROM matches WHERE id = ?`

  try {
    await db.execute(query, [id]);
    res.status(200).json({ message: 'match eliminada correctamente.' })
  } catch (error) {
    console.error('Error al eliminar match:', error)
    res.status(500).json({ message: 'Error interno del servidor.' })
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