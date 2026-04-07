/* star-catalog.js — 밝은 항성 120개 (Yale BSC subset)
   RA: 시(hour), Dec: 도(degree), mag: 겉보기등급, name: 이름 */
const STARS = [
  // Orion
  {ra:5.919,dec:-8.20,mag:0.13,name:'Betelgeuse'},{ra:5.242,dec:-8.20,mag:0.12,name:'Rigel'},
  {ra:5.679,dec:-1.94,mag:1.70,name:'Bellatrix'},{ra:5.603,dec:-1.20,mag:2.06,name:'Mintaka'},
  {ra:5.533,dec:-0.30,mag:1.69,name:'Alnilam'},{ra:5.412,dec:-1.94,mag:1.77,name:'Alnitak'},
  {ra:5.795,dec:-9.67,mag:2.07,name:'Saiph'},
  // Ursa Major
  {ra:11.062,dec:61.75,mag:1.79,name:'Dubhe'},{ra:11.031,dec:56.38,mag:2.37,name:'Merak'},
  {ra:11.897,dec:53.69,mag:2.44,name:'Phecda'},{ra:12.257,dec:57.03,mag:3.31,name:'Megrez'},
  {ra:12.900,dec:55.96,mag:1.77,name:'Alioth'},{ra:13.399,dec:54.93,mag:2.27,name:'Mizar'},
  {ra:13.792,dec:49.31,mag:1.86,name:'Alkaid'},
  // Bright stars
  {ra:6.752,dec:-16.72,mag:-1.46,name:'Sirius'},{ra:6.399,dec:-52.70,mag:-0.72,name:'Canopus'},
  {ra:14.261,dec:-60.83,mag:-0.04,name:'Alpha Centauri'},{ra:14.660,dec:19.18,mag:-0.05,name:'Arcturus'},
  {ra:18.616,dec:38.78,mag:0.03,name:'Vega'},{ra:5.278,dec:45.99,mag:0.08,name:'Capella'},
  {ra:7.655,dec:5.22,mag:0.34,name:'Procyon'},{ra:1.628,dec:-57.24,mag:0.46,name:'Achernar'},
  {ra:19.846,dec:8.87,mag:0.76,name:'Altair'},{ra:4.598,dec:16.51,mag:0.85,name:'Aldebaran'},
  {ra:16.490,dec:-26.43,mag:0.96,name:'Antares'},{ra:12.443,dec:-63.10,mag:0.77,name:'Acrux'},
  {ra:7.139,dec:-26.39,mag:1.50,name:'Wezen'},{ra:20.690,dec:45.28,mag:1.25,name:'Deneb'},
  {ra:10.140,dec:11.97,mag:1.35,name:'Regulus'},{ra:2.120,dec:89.26,mag:2.02,name:'Polaris'},
  {ra:22.096,dec:-29.62,mag:1.16,name:'Fomalhaut'},{ra:12.694,dec:-59.69,mag:1.25,name:'Beta Centauri'},
  {ra:13.420,dec:-11.16,mag:0.97,name:'Spica'},{ra:6.977,dec:-28.97,mag:1.84,name:'Adhara'},
  // Scorpius
  {ra:16.836,dec:-34.29,mag:1.63,name:'Shaula'},{ra:17.560,dec:-37.10,mag:1.87,name:'Sargas'},
  {ra:16.006,dec:-22.62,mag:2.56,name:'Dschubba'},{ra:16.091,dec:-19.81,mag:2.32,name:'Acrab'},
  // Leo
  {ra:10.333,dec:19.84,mag:2.14,name:'Algieba'},{ra:11.818,dec:14.57,mag:2.14,name:'Denebola'},
  // Gemini
  {ra:7.577,dec:31.89,mag:1.14,name:'Pollux'},{ra:7.576,dec:28.03,mag:1.58,name:'Castor'},
  // Taurus
  {ra:3.792,dec:24.11,mag:2.87,name:'Alcyone'},{ra:4.476,dec:15.87,mag:3.65,name:'Hyadum'},
  // Lyra
  {ra:18.982,dec:32.69,mag:3.24,name:'Sulafat'},{ra:18.746,dec:37.60,mag:3.26,name:'Sheliak'},
  // Cygnus
  {ra:19.512,dec:27.96,mag:2.20,name:'Sadr'},{ra:20.370,dec:40.26,mag:2.48,name:'Gienah Cygni'},
  // Cassiopeia
  {ra:0.153,dec:59.15,mag:2.27,name:'Schedar'},{ra:0.675,dec:56.54,mag:2.28,name:'Caph'},
  {ra:0.945,dec:60.72,mag:2.47,name:'Gamma Cas'},{ra:1.430,dec:60.24,mag:2.68,name:'Ruchbah'},
  // Aquila
  {ra:19.771,dec:10.61,mag:2.72,name:'Tarazed'},{ra:19.922,dec:6.41,mag:3.36,name:'Alshain'},
  // Pegasus
  {ra:21.736,dec:9.88,mag:2.49,name:'Enif'},{ra:23.079,dec:28.08,mag:2.42,name:'Scheat'},
  {ra:23.063,dec:15.21,mag:2.44,name:'Markab'},{ra:0.220,dec:15.18,mag:2.06,name:'Alpheratz'},
  // Sagittarius
  {ra:18.350,dec:-29.83,mag:1.85,name:'Kaus Australis'},{ra:18.921,dec:-26.30,mag:2.60,name:'Ascella'},
  {ra:19.044,dec:-29.88,mag:2.05,name:'Nunki'},
  // Perseus
  {ra:3.405,dec:49.86,mag:1.80,name:'Mirfak'},{ra:3.136,dec:40.96,mag:2.12,name:'Algol'},
  // Andromeda
  {ra:1.163,dec:35.62,mag:2.06,name:'Mirach'},{ra:2.065,dec:42.33,mag:2.07,name:'Almach'},
  // Auriga
  {ra:5.995,dec:44.95,mag:1.90,name:'Menkalinan'},{ra:5.438,dec:28.61,mag:2.69,name:'El Nath'},
  // Centaurus
  {ra:14.064,dec:-36.37,mag:2.06,name:'Menkent'},{ra:12.139,dec:-50.72,mag:2.20,name:'Muhlifain'},
  // Canis Major
  {ra:6.378,dec:-17.96,mag:1.98,name:'Mirzam'},{ra:7.402,dec:-29.30,mag:1.50,name:'Aludra'},
  // Crux
  {ra:12.795,dec:-59.69,mag:1.25,name:'Mimosa'},{ra:12.252,dec:-58.75,mag:1.63,name:'Gacrux'},
  // Eridanus
  {ra:5.131,dec:-5.09,mag:2.79,name:'Cursa'},{ra:3.549,dec:-9.46,mag:2.95,name:'Zaurak'},
  // Virgo
  {ra:12.927,dec:3.40,mag:2.83,name:'Vindemiatrix'},{ra:13.036,dec:10.96,mag:2.74,name:'Epsilon Vir'},
  // Piscis Austrinus
  // Triangulum Australe
  {ra:16.811,dec:-69.03,mag:1.92,name:'Atria'},
  // Carina
  {ra:9.220,dec:-69.72,mag:1.68,name:'Miaplacidus'},{ra:8.375,dec:-59.51,mag:1.86,name:'Avior'},
  // Puppis
  {ra:8.126,dec:-24.30,mag:2.25,name:'Naos'},{ra:6.629,dec:-43.20,mag:2.21,name:'Pi Puppis'},
  // Hydra
  {ra:9.460,dec:-8.66,mag:1.98,name:'Alphard'},
  // Aries
  {ra:2.120,dec:23.46,mag:2.00,name:'Hamal'},{ra:1.911,dec:20.81,mag:2.64,name:'Sheratan'},
  // Pisces / Cetus
  {ra:2.722,dec:3.24,mag:2.04,name:'Mira'},{ra:0.726,dec:-17.99,mag:2.04,name:'Diphda'},
  // Corona Borealis
  {ra:15.578,dec:26.71,mag:2.23,name:'Alphecca'},
  // Bootes
  {ra:15.032,dec:40.39,mag:2.68,name:'Izar'},
  // Libra
  {ra:14.848,dec:-16.04,mag:2.61,name:'Zubenelgenubi'},{ra:15.283,dec:-9.38,mag:2.61,name:'Zubeneschamali'},
  // Ophiuchus
  {ra:17.582,dec:12.56,mag:2.08,name:'Rasalhague'},{ra:16.619,dec:-10.57,mag:2.43,name:'Yed Prior'},
  // Hercules
  {ra:17.244,dec:14.39,mag:2.77,name:'Kornephoros'},{ra:16.688,dec:31.60,mag:2.81,name:'Rutilicus'},
  // Draco
  {ra:17.943,dec:51.49,mag:2.24,name:'Eltanin'},{ra:17.507,dec:52.30,mag:2.74,name:'Rastaban'},
  // Lupus / Ara
  {ra:14.698,dec:-47.39,mag:2.30,name:'Alpha Lupi'},{ra:17.531,dec:-49.88,mag:2.85,name:'Alpha Arae'},
  // Grus
  {ra:22.137,dec:-46.96,mag:1.74,name:'Alnair'},{ra:22.711,dec:-46.88,mag:2.11,name:'Gruid'},
  // Pavo
  {ra:20.427,dec:-56.74,mag:1.94,name:'Peacock'},
  // Phoenix
  {ra:0.438,dec:-42.31,mag:2.37,name:'Ankaa'},
  // Columba
  {ra:5.849,dec:-34.07,mag:2.64,name:'Phact'},
  // Vela
  {ra:8.158,dec:-47.34,mag:1.78,name:'Regor'},{ra:9.133,dec:-43.43,mag:2.21,name:'Alsuhail'},
];
