/**
 * Map dot anchors (decision 14): fixed, hand-set, inside their area, away from towns and
 * known military sites, and independent of event data. No database.
 * Run: npm test
 *
 * KNOWN_SITES: approximate (about 5 km) locations of publicly reported military sites and
 * garrison towns, from open sources (official defence ministry pages, NATO and press
 * reporting). Used only for this distance check; never shown on any page.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import anchors from "../../data/map-anchors.json";
import { buildMapData, type MapEventRow } from "./map-data";
import { areaAnchor, dotFeatures, regionAnchor } from "./map-dots";
import { inGeometry, REGIONS, UNITS, type RegionFeatureCollection } from "./placement";

type Ref = [name: string, lon: number, lat: number];

const KNOWN_SITES: Ref[] = [
  ["Rukla", 24.20, 55.07], ["Gaižiūnai training area", 24.25, 55.00],
  ["Pabradė training area", 25.76, 54.98], ["Rūdninkai training area", 25.07, 54.43],
  ["Šiauliai air base", 23.39, 55.89], ["Kazlų Rūda training area", 23.50, 54.76],
  ["Klaipėda naval base", 21.13, 55.70], ["Kairiai (Šiauliai)", 23.30, 55.85],
  ["Vilnius", 25.28, 54.69], ["Kaunas", 23.90, 54.90], ["Ādaži base", 24.37, 57.08],
  ["Lielvārde air base", 24.85, 56.77], ["Selonia training area", 25.60, 56.35],
  ["Liepāja naval base", 21.02, 56.53], ["Alūksne", 27.05, 57.42], ["Rēzekne", 27.33, 56.51],
  ["Daugavpils", 26.54, 55.88], ["Riga", 24.11, 56.95], ["Tapa", 25.96, 59.26],
  ["Ämari air base", 24.21, 59.26], ["Paldiski", 24.05, 59.35],
  ["Central training area (Aegviidu)", 25.65, 59.30], ["Võru", 27.00, 57.83],
  ["Nursipalu training area", 27.25, 57.72], ["Jõhvi", 27.41, 59.36], ["Narva", 28.19, 59.38],
  ["Tallinn", 24.75, 59.44], ["Orzysz / Bemowo Piskie", 21.95, 53.80], ["Redzikowo", 16.93, 54.48],
  ["Powidz air base", 17.85, 52.38], ["Łask air base", 19.18, 51.55],
  ["Krzesiny air base", 16.97, 52.33], ["Mirosławiec air base", 16.08, 53.34],
  ["Malbork air base", 19.13, 54.03], ["Gdynia naval base", 18.55, 54.53],
  ["Świnoujście", 14.25, 53.91], ["Drawsko Pomorskie training area", 15.85, 53.53],
  ["Wędrzyn", 15.00, 52.47], ["Żagań", 15.32, 51.62], ["Rzeszów-Jasionka", 22.02, 50.11],
  ["Węgorzewo", 21.73, 54.21], ["Bartoszyce", 20.81, 54.25], ["Braniewo", 19.83, 54.38],
  ["Giżycko", 21.77, 54.04], ["Suwałki", 22.93, 54.10], ["Białystok", 23.15, 53.13],
  ["Ustka", 16.85, 54.58], ["Elbląg", 19.40, 54.16], ["Warsaw", 21.01, 52.23],
  ["Dęblin air base", 21.85, 51.55], ["Mińsk Mazowiecki air base", 21.65, 52.20],
  ["Nowa Dęba training area", 21.75, 50.42], ["Baltiysk", 19.90, 54.65],
  ["Chkalovsk air base", 20.40, 54.77], ["Donskoye air base", 19.95, 54.93],
  ["Chernyakhovsk", 21.80, 54.63], ["Gusev", 22.20, 54.59], ["Kaliningrad", 20.51, 54.71],
  ["Sovetsk", 21.87, 55.08], ["Gvardeysk", 21.07, 54.65], ["Pravdinsk", 21.01, 54.44],
  ["Pionersky", 20.23, 54.95], ["Machulishchy air base", 27.58, 53.77],
  ["Baranavichy air base", 26.03, 53.10], ["Lida air base", 25.32, 53.88],
  ["Asipovichy", 28.64, 53.30], ["Barysaw / Pechi", 28.55, 54.20], ["Brest", 23.70, 52.10],
  ["Hrodna", 23.83, 53.68], ["Vitebsk", 30.20, 55.19], ["Polotsk", 28.80, 55.48],
  ["Maladzyechna", 26.85, 54.31], ["Zyabrovka", 31.12, 52.30], ["Mazyr", 29.25, 52.05],
  ["Gomel", 30.98, 52.43], ["Vileyka transmitter", 26.90, 54.47], ["Hantsavichy radar", 26.43, 52.75],
  ["Obuz-Lesnovsky training area", 25.85, 53.13], ["Brestsky training area", 23.90, 52.33],
  ["Gozhsky training area", 23.95, 53.83], ["Lepel", 28.70, 54.88], ["Minsk", 27.56, 53.90],
  ["Mogilev", 30.33, 53.90], ["Pskov / Kresty", 28.40, 57.80], ["Ostrov air base", 28.35, 57.30],
  ["Luga", 29.85, 58.73], ["Kamenka", 29.60, 60.43], ["Levashovo", 30.20, 60.10],
  ["Kronstadt", 29.77, 59.99], ["Vyborg", 28.75, 60.71], ["Sertolovo", 30.20, 60.15],
  ["Saint Petersburg", 30.31, 59.94], ["Ust-Luga", 28.40, 59.68], ["Gogland island", 27.00, 60.05],
  ["Veliky Novgorod", 31.27, 58.52], ["Krechevitsy", 31.40, 58.62], ["Valday", 33.24, 57.98],
  ["Staraya Russa", 31.36, 57.99], ["Velikiye Luki", 30.53, 56.34], ["Smolensk", 32.05, 54.78],
  ["Shatalovo air base", 32.48, 54.33], ["Yelnya", 33.18, 54.57], ["Roslavl", 32.87, 53.95],
  ["Gotland (Visby)", 18.30, 57.64], ["Bornholm (Rønne)", 14.70, 55.10], ["Helsinki", 24.94, 60.17],
  ["Hanko", 22.95, 59.82], ["Kotka", 26.94, 60.47],
];

/** Natural Earth populated places in the theater plus the gazetteer's towns. */
const TOWNS: Ref[] = [
  ["Falun", 15.65, 60.61], ["Nyköping", 17.00, 58.75], ["Karlskrona", 15.59, 56.16],
  ["Bærum", 11.35, 59.91], ["Hamar", 11.07, 60.82], ["Tønsberg", 10.42, 59.26],
  ["Mariestad", 13.83, 58.71], ["Vannersborg", 12.33, 58.36], ["Haapsalu", 23.54, 58.94],
  ["Viljandi", 25.59, 58.36], ["Mariehamn", 19.95, 60.10], ["Hämeenlinna", 24.47, 61.00],
  ["Kouvola", 26.71, 60.88], ["Mikkeli", 27.29, 61.69], ["Vejle", 9.53, 55.71],
  ["Hillerød", 12.32, 55.93], ["Sorø", 11.57, 55.43], ["Usti Nad Labem", 14.08, 50.66],
  ["Hradec Králové", 15.81, 50.21], ["Schwerin", 11.42, 53.63], ["Borlänge", 15.42, 60.48],
  ["Västerås", 16.56, 59.61], ["Chernihiv", 31.30, 51.50], ["Khmelnytskyy", 27.00, 49.42],
  ["Kamyanets-Podilskyy", 26.58, 48.68], ["Drohobych", 23.50, 49.34], ["Uzhgorod", 22.25, 48.63],
  ["Uman", 30.21, 48.75], ["Brovary", 30.78, 50.49], ["Bila Tserkva", 30.13, 49.77],
  ["Konotop", 33.21, 51.24], ["Gjøvik", 10.70, 60.80], ["Banská Bystrica", 19.15, 48.73],
  ["Rēzekne", 27.32, 56.50], ["Panevežys", 24.37, 55.74], ["Šiauliai", 23.33, 55.94],
  ["Chernyakhovsk", 21.81, 54.63], ["Slantsy", 28.07, 59.11], ["Kolpino", 30.65, 59.73],
  ["Novozybkov", 31.94, 52.53], ["Dyatkovo", 34.34, 53.59], ["Rzhev", 34.33, 56.26],
  ["Vyshnniy Volochek", 34.56, 57.58], ["Klin", 36.70, 56.34], ["Shebekino", 36.89, 50.41],
  ["Olsztyn", 20.49, 53.77], ["Elbląg", 19.40, 54.15], ["Inowrocław", 18.25, 52.78],
  ["Bytom", 18.91, 50.35], ["Opole", 17.93, 50.68], ["Kassel", 9.50, 51.30],
  ["Braunschweig", 10.50, 52.25], ["Erfurt", 11.03, 50.97], ["Coburg", 10.97, 50.27],
  ["Fürth", 11.00, 49.47], ["České Budějovice", 14.46, 48.98], ["Liberec", 15.08, 50.80],
  ["Chemnitz", 12.92, 50.83], ["Olomouc", 17.26, 49.59], ["Kohtla-Järve", 27.28, 59.40],
  ["Savonlinna", 28.88, 61.87], ["Pori", 21.77, 61.48], ["Viborg", 9.40, 56.43],
  ["Roskilde", 12.08, 55.65], ["Baranavichy", 26.01, 53.14], ["Polatsk", 28.79, 55.49],
  ["Maladzyechna", 26.87, 54.32], ["Koszalin", 16.18, 54.20], ["Bollnäs", 16.37, 61.35],
  ["Gävle", 17.17, 60.67], ["Kalmar", 16.37, 56.67], ["Växjö", 14.82, 56.88], ["Örebro", 15.22, 59.28],
  ["Norrköping", 16.18, 58.60], ["Halmstad", 12.86, 56.67], ["Karlstad", 13.50, 59.37],
  ["Visby", 18.30, 57.63], ["Nizhyn", 31.89, 51.05], ["Rivne", 26.25, 50.62],
  ["Ivano-Frankivsk", 24.71, 48.93], ["Ternopil", 25.58, 49.54], ["Lutsk", 25.33, 50.75],
  ["Kovel", 24.72, 51.22], ["Cherkasy", 32.07, 49.43], ["Kirovohrad", 32.26, 48.50],
  ["Vinnytsya", 28.48, 49.23], ["Korosten", 28.65, 50.95], ["Shostka", 33.48, 51.87],
  ["Poltava", 34.57, 49.57], ["Kremenchuk", 33.43, 49.08], ["Trollhättan", 12.30, 58.27],
  ["Borås", 12.94, 57.72], ["Kristianstad", 14.13, 56.03], ["Helsingborg", 12.72, 56.04],
  ["Drammen", 10.20, 59.74], ["Moss", 10.67, 59.44], ["Ventspils", 21.56, 57.39],
  ["Klaipėda", 21.12, 55.72], ["Zvolen", 19.13, 48.58], ["Žilina", 18.75, 49.22],
  ["Košice", 21.25, 48.73], ["Prešov", 21.24, 49.00], ["Kaunas", 23.88, 54.95],
  ["Jelgava", 23.71, 56.65], ["Sovetsk", 21.88, 55.07], ["Borovichi", 33.90, 58.40],
  ["Staraya Russa", 31.35, 57.99], ["Volkhov", 32.34, 59.93], ["Tikhvin", 33.51, 59.64],
  ["Svetogorsk", 28.92, 61.10], ["Gatchina", 30.13, 59.57], ["Luga", 29.84, 58.74],
  ["Klintsy", 32.24, 52.77], ["Roslavl", 32.86, 53.95], ["Safonovo", 33.22, 55.15],
  ["Vyazma", 34.29, 55.21], ["Bezhetsk", 36.69, 57.76], ["Nelidovo", 32.77, 56.22],
  ["Bologoye", 34.05, 57.87], ["Torzhok", 34.98, 57.03], ["Kaluga", 36.27, 54.52],
  ["Kirov", 34.30, 54.09], ["Obninsk", 36.62, 55.08], ["Lgov", 35.27, 51.69],
  ["Zheleznogorsk", 35.40, 52.35], ["Solnechnogorsk", 36.98, 56.18], ["Mtsensk", 36.55, 53.26],
  ["Ełk", 22.35, 53.83], ["Gdynia", 18.53, 54.52], ["Wrocław", 17.03, 51.11],
  ["Szczecin", 14.53, 53.42], ["Zielona Góra", 15.50, 51.95], ["Poznań", 16.90, 52.41],
  ["Grudziądz", 18.75, 53.48], ["Bydgoszcz", 18.01, 53.12], ["Katowice", 19.02, 50.26],
  ["Gliwice", 18.67, 50.33], ["Kielce", 20.66, 50.89], ["Białystok", 23.18, 53.13],
  ["Lublin", 22.57, 51.25], ["Rzeszów", 22.00, 50.03], ["Hanover", 9.72, 52.37],
  ["Göttingen", 9.92, 51.52], ["Gera", 12.07, 50.87], ["Jena", 11.58, 50.93],
  ["Flensburg", 9.43, 54.78], ["Lübeck", 10.67, 53.87], ["Kiel", 10.13, 54.33],
  ["Pizen", 13.36, 49.74], ["Regensburg", 12.12, 49.02], ["Hof", 11.92, 50.32],
  ["Würzburg", 9.95, 49.80], ["Ingolstadt", 11.45, 48.77], ["Jihlava", 15.58, 49.40],
  ["Zlín", 17.65, 49.23], ["Brno", 16.61, 49.20], ["Pardubice", 15.76, 50.04],
  ["Cottbus", 14.33, 51.77], ["Potsdam", 13.07, 52.40], ["Magdeburg", 11.62, 52.13],
  ["Leipzig", 12.41, 51.34], ["Ostrava", 18.25, 49.83], ["Narva", 28.16, 59.38],
  ["Stralsund", 13.10, 54.30], ["Rostock", 12.15, 54.07], ["Lappeenranta", 28.18, 61.07],
  ["Porvoo", 25.67, 60.40], ["Svendborg", 10.62, 55.07], ["Odense", 10.38, 55.40],
  ["Frederikshavn", 10.53, 57.43], ["Aalborg", 9.92, 57.03], ["Passau", 13.44, 48.58],
  ["Pinsk", 26.09, 52.13], ["Mazyr", 29.27, 52.05], ["Mahilyow", 30.32, 53.90],
  ["Babruysk", 29.19, 53.13], ["Orsha", 30.42, 54.52], ["Lida", 25.28, 53.89],
  ["Hrodna", 23.83, 53.68], ["Barysaw", 28.49, 54.23], ["Jönköping", 14.17, 57.77],
  ["Skien", 9.60, 59.20], ["Liepaga", 21.01, 56.51], ["Velikiy Novgorod", 31.33, 58.50],
  ["Velikiye Luki", 30.52, 56.32], ["Kursk", 36.19, 51.74], ["Stuttgart", 9.20, 48.78],
  ["Nürnberg", 11.08, 49.45], ["Lahti", 25.66, 60.99], ["Turku", 22.25, 60.45],
  ["Chernobyl", 30.10, 51.39], ["Sumy", 34.78, 50.92], ["Homyel", 31.00, 52.43],
  ["Linköping", 15.63, 58.41], ["Uppsala", 17.64, 59.86], ["Lillehammer", 10.50, 61.13],
  ["Vyborg", 28.75, 60.70], ["Orel", 36.07, 52.97], ["Belgorod", 36.60, 50.63], ["Łódź", 19.46, 51.77],
  ["Göteborg", 11.98, 57.71], ["Daugavpils", 26.51, 55.88], ["Tartu", 26.71, 58.38],
  ["Pärnu", 24.51, 58.37], ["Århus", 10.21, 56.16], ["Vitsyebsk", 30.19, 55.19],
  ["Lviv", 24.03, 49.83], ["Zhytomyr", 28.66, 50.25], ["Kharkiv", 36.25, 50.00],
  ["Kaliningrad", 20.50, 54.70], ["Pskov", 28.33, 57.83], ["Bryansk", 34.43, 53.26],
  ["Smolensk", 32.05, 54.78], ["Petrozavodsk", 34.36, 61.78], ["Tver", 35.89, 56.86],
  ["Gdańsk", 18.64, 54.36], ["Kraków", 19.96, 50.06], ["Malmö", 13.02, 55.60],
  ["Dresden", 13.75, 51.05], ["Tampere", 23.75, 61.50], ["Brest", 23.70, 52.10],
  ["Vilnius", 25.32, 54.68], ["Riga", 24.10, 56.95], ["Tallinn", 24.73, 59.43],
  ["Minsk", 27.56, 53.90], ["Oslo", 10.75, 59.92], ["St.  Petersburg", 30.31, 59.94],
  ["Warsaw", 21.01, 52.23], ["Hamburg", 10.00, 53.55], ["Prague", 14.42, 50.09],
  ["Helsinki", 24.93, 60.16], ["København", 12.56, 55.68], ["Kyiv", 30.51, 50.44],
  ["Stockholm", 18.07, 59.32], ["Berlin", 13.40, 52.52], ["Radom", 21.15, 51.40],
  ["Ostrów Mazowiecka", 21.89, 52.80], ["Hel", 18.80, 54.61], ["Słupsk", 17.03, 54.46],
  ["Gołdap", 22.31, 54.31], ["Mrągowo", 21.31, 53.86], ["Augustów", 22.98, 53.84],
  ["Sejny", 23.35, 54.11], ["Hajnówka", 23.58, 52.74], ["Białowieża", 23.84, 52.70],
  ["Kuźnica", 23.65, 53.51], ["Bobrowniki", 23.80, 53.13], ["Terespol", 23.62, 52.08],
  ["Biała Podlaska", 23.12, 52.03], ["Chełm", 23.47, 51.14], ["Włodawa", 23.55, 51.55],
  ["Toruń", 18.60, 53.01], ["Jonava", 24.28, 55.08], ["Kėdainiai", 23.97, 55.29],
  ["Kaišiadorys", 24.48, 54.86], ["Šalčininkai", 25.38, 54.31], ["Švenčionys", 26.16, 55.14],
  ["Medininkai", 25.65, 54.54], ["Trakai", 24.93, 54.64], ["Ignalina", 26.16, 55.34],
  ["Visaginas", 26.43, 55.60], ["Druskininkai", 23.97, 54.02], ["Lazdijai", 23.52, 54.23],
  ["Varėna", 24.57, 54.22], ["Vilkaviškis", 23.03, 54.65], ["Kybartai", 22.76, 54.64],
  ["Pagėgiai", 21.91, 55.14], ["Palanga", 21.07, 55.92], ["Nida", 21.00, 55.30],
  ["Mažeikiai", 22.34, 56.31], ["Plungė", 21.85, 55.91], ["Panevėžys", 24.36, 55.73],
  ["Utena", 25.60, 55.50], ["Telšiai", 22.25, 55.98], ["Tauragė", 22.29, 55.25],
  ["Marijampolė", 23.35, 54.56], ["Alytus", 24.05, 54.40], ["Jūrmala", 23.77, 56.97],
  ["Sigulda", 24.86, 57.15], ["Tukums", 23.15, 56.97], ["Ogre", 24.60, 56.82],
  ["Limbaži", 24.71, 57.51], ["Saulkrasti", 24.41, 57.26], ["Kuldīga", 21.97, 56.97],
  ["Talsi", 22.59, 57.24], ["Saldus", 22.49, 56.66], ["Bauska", 24.19, 56.41],
  ["Dobele", 23.28, 56.63], ["Jēkabpils", 25.86, 56.50], ["Aizkraukle", 25.25, 56.60],
  ["Valmiera", 25.43, 57.54], ["Cēsis", 25.27, 57.31], ["Gulbene", 26.75, 57.18],
  ["Madona", 26.22, 56.85], ["Ludza", 27.72, 56.55], ["Krāslava", 27.17, 55.90],
  ["Zilupe", 28.12, 56.39], ["Terehova", 28.17, 56.49], ["Preiļi", 26.72, 56.29],
  ["Balvi", 27.27, 57.13], ["Rakvere", 26.36, 59.35], ["Sillamäe", 27.76, 59.40],
  ["Narva-Jõesuu", 28.04, 59.46], ["Koidula", 27.56, 57.83], ["Paide", 25.56, 58.89],
  ["Kuressaare", 22.49, 58.25], ["Rapla", 24.79, 59.00], ["Valga", 26.05, 57.78],
  ["Põlva", 27.07, 58.06], ["Jõgeva", 26.39, 58.75], ["Kärdla", 22.75, 58.99], ["Türi", 25.43, 58.81],
  ["Shchuchyn", 24.74, 53.60], ["Ashmyany", 25.94, 54.43], ["Smarhon", 26.40, 54.48],
  ["Vawkavysk", 24.47, 53.16], ["Astravyets", 25.95, 54.61], ["Kobryn", 24.36, 52.21],
  ["Luninets", 26.80, 52.25], ["Navapolatsk", 28.65, 55.53], ["Pastavy", 26.84, 55.12],
  ["Slutsk", 27.55, 53.03], ["Salihorsk", 27.53, 52.79], ["Zelenogradsk", 20.48, 54.96],
  ["Svetly", 20.13, 54.67], ["Neman", 22.03, 55.03], ["Polessk", 21.10, 54.86],
  ["Krasnoznamensk", 22.49, 54.95], ["Nesterov", 22.56, 54.63], ["Ozyorsk", 22.02, 54.41],
  ["Bagrationovsk", 20.64, 54.39], ["Ust-Luga", 28.40, 59.68], ["Kingisepp", 28.61, 59.37],
  ["Ivangorod", 28.21, 59.37], ["Sosnovy Bor", 29.09, 59.90], ["Primorsk", 28.62, 60.36],
  ["Gdov", 27.73, 58.74], ["Pechory", 27.61, 57.81], ["Porkhov", 29.56, 57.77], ["Dno", 29.96, 57.83],
  ["Opochka", 28.66, 56.71], ["Nevel", 29.92, 56.02], ["Cherekha", 28.30, 57.73],
  ["Soltsy", 30.31, 58.12], ["Kholm", 31.18, 57.15], ["Velizh", 31.19, 55.61],
  ["Demidov", 31.51, 55.27], ["Dorogobuzh", 33.29, 54.91], ["Pochinok", 32.44, 54.41],
  ["Starye Dorogi", 28.27, 53.04], ["Klichaw", 29.34, 53.49], ["Byerazino", 28.99, 53.84],
  ["Chervyen", 28.43, 53.71], ["Lyepyel", 28.69, 54.88], ["Hlybokaye", 27.69, 55.14],
  ["Miory", 27.62, 55.62], ["Braslaw", 27.04, 55.64], ["Dokshytsy", 27.77, 54.89],
  ["Masty", 24.54, 53.42], ["Dzyatlava", 25.40, 53.46], ["Navahrudak", 25.82, 53.60],
  ["Iwye", 25.77, 53.93], ["Byaroza", 24.97, 52.53], ["Pruzhany", 24.46, 52.56],
  ["Ivatsevichy", 25.34, 52.71], ["Drahichyn", 25.15, 52.19], ["Zhytkavichy", 27.86, 52.23],
  ["Kalinkavichy", 29.33, 52.13], ["Rechytsa", 30.39, 52.36], ["Svetlahorsk", 29.73, 52.63],
  ["Zhlobin", 30.02, 52.89], ["Krychaw", 31.71, 53.71], ["Bykhaw", 30.25, 53.52],
  ["Shklow", 30.30, 54.21],
];

const MIN_KM = 15;
const geo = JSON.parse(readFileSync("public/geo/theater.geojson", "utf8")) as RegionFeatureCollection;

function km(a: [number, number], b: [number, number]): number {
  const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * 111.32 * k, (a[1] - b[1]) * 110.57);
}

const all = [
  ...Object.entries(anchors.areas).map(([id, at]) => ({ id, level: "unit", at: at as [number, number] })),
  ...Object.entries(anchors.regions).map(([id, at]) => ({ id, level: "region", at: at as [number, number] })),
];

test("every map area and every region except the two cities has an anchor; cards have none", () => {
  const onMap = UNITS.filter((u) => u.onMap !== false).map((u) => u.id).sort();
  assert.deepEqual(Object.keys(anchors.areas).sort(), onMap);
  const dotted = REGIONS.map((r) => r.id).filter((id) => !anchors.noDot.includes(id)).sort();
  assert.deepEqual(Object.keys(anchors.regions).sort(), dotted);
  assert.deepEqual([...anchors.noDot].sort(), ["BY-HM", "RU-SPE"]);
  for (const u of UNITS.filter((x) => x.onMap === false)) assert.equal(areaAnchor(u.id), undefined, u.id);
});

test("anchors are rounded to 0.1 degrees and lie inside their own area or region", () => {
  for (const a of all) {
    for (const v of a.at) assert.equal(Math.round(v * 10) / 10, v, `${a.id} not rounded`);
    const f = geo.features.find((x) => x.properties.id === a.id && (x.properties.level ?? "region") === a.level);
    assert.ok(f, `${a.id} has a ${a.level} feature`);
    assert.ok(inGeometry(f.geometry, a.at[0], a.at[1]), `${a.id} anchor is outside its shape`);
  }
});

test(`anchors are at least ${MIN_KM} km from every listed town and known military site`, () => {
  for (const a of all) {
    for (const [name, lon, lat] of [...KNOWN_SITES, ...TOWNS]) {
      const d = km(a.at, [lon, lat]);
      assert.ok(d >= MIN_KM, `${a.id} is ${d.toFixed(1)} km from ${name}`);
    }
  }
});

test("dot positions are fixed and independent of event data", () => {
  const now = new Date("2026-10-03T12:00:00Z");
  const event = (o: Partial<MapEventRow>): MapEventRow => ({
    event_id: crypto.randomUUID(), event_date: new Date("2026-10-01T00:00:00Z"), first_reported: null,
    headline: "x", summary: null, activity_description: null, event_type: "AIR_ACTIVITY",
    confidence_level: "MODERATE", country: "Lithuania", location_name: "Vilnius", latitude: null,
    longitude: null, exercise_id: null, support_tiers: [3], ...o,
  });
  const a = buildMapData({ events: [event({})], exercises: [] }, { days: 30, layer: "all", now, geo });
  const b = buildMapData(
    {
      events: [
        event({ latitude: 54.9, longitude: 25.9 }),
        event({ location_name: "Pabradė", latitude: 55.0, longitude: 25.8 }),
        event({ location_name: "Rukla" }),
        event({ location_name: "Rukla" }),
      ],
      exercises: [],
    },
    { days: 30, layer: "all", now, geo },
  );
  for (const zoom of [null, "LT"]) {
    const da = dotFeatures(a.units, zoom).features;
    const db = dotFeatures(b.units, zoom).features;
    for (const f of [...da, ...db]) {
      const fixed = zoom ? regionAnchor(f.properties.id) : areaAnchor(f.properties.id);
      assert.deepEqual(f.geometry.coordinates, fixed, `${f.properties.id} moved`);
      assert.deepEqual(Object.keys(f.properties).sort(), ["id", "step"]);
    }
    assert.ok(db.some((f) => f.properties.step > (da.find((x) => x.properties.id === f.properties.id)?.properties.step ?? 0)));
  }
});

test("no dot for zero activity", () => {
  const empty = UNITS.map((u) => ({ id: u.id, step: 0 as const, onMap: u.onMap !== false, regions: [] }));
  assert.equal(dotFeatures(empty, null).features.length, 0);
});
