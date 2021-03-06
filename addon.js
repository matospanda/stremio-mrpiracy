const { addonBuilder } = require('stremio-addon-sdk')
const cheerio = require('cheerio')
const request = require('request')
const package = require('./package.json')
const mrpiracy_genrs = {'Ação':15,'Animação':14,'Animes':23,'Aventura':13,'Biografia':18,'Comédia':12,'Crime':11,'Curtas Metragens':36,'Desporto':27,'Documentário':10,'Drama':9,'Família':37,'Fantasia':8,'Faroeste':16,'Ficção Científica':24,'Guerra':6,'História':19,'LGBTI':32,'Mistério':20,'Musica':5,'Natal':30,'Policial':4,'Religião':21,'Romance':3,'Stand Up':35,'Suspense':2,'Terror':1,'Thriller ':22}

const endpoint = 'https://ww10.mrpiracy.top'

const oneDay = 24 * 60 * 60 // in seconds

const cache = {
	maxAge: 0.8 * oneDay, // 0.8 days
	staleError: 6 * 30 * oneDay // 6 months
}

const manifest = {
	id: 'community.mrpiracy',
	logo: 'https://s33.postimg.cc/5nno5wc7j/face2017.png',
	version: package.version,
	catalogs: [{type:'movie',id:'mr_piracy',name:'Mr Piracy',extra: [
		{
		  name: 'genre',
		  options: Object.keys(mrpiracy_genrs),
		  isRequired: false
		}
	  ]},{type:'series',id:'mr_piracy',name:'Mr Piracy',extra: [
		{
		  name: 'genre',
		  options: Object.keys(mrpiracy_genrs),
		  isRequired: false
		}
	  ]}],
	resources: ['catalog', 'stream'],
	types: ['movie','series'],
	name: 'Mr Piracy',
	description: 'Mr Piracy list and streams',
	idPrefixes: ['tt']

}

const builder = new addonBuilder(manifest)

function getMoviesMRpiracy(page,type='filmes',cat=false){
	return new Promise((resolve, reject) => {
		request(endpoint+'/'+type+'.php?'+(cat?'categoria='+mrpiracy_genrs[cat]+'&':'')+'pagina='+page, function (error, response, html) {
			if (!error && response.statusCode == 200) {
				const $ = cheerio.load(html,{ decodeEntities: false });
				var metas = [];
				var $items = $('#movies-list .item');
				for (let i = 0; i < $items.length; i++) {
					const $item = $($items[i]);
					var imdb = $item.find('a').attr('href').match(/tt[^.]+/);
					if(imdb == undefined) continue;
					imdb = imdb[0];
					if(imdb.endsWith('pt')) imdb = imdb.slice(0,imdb.length-2);
					metas.push({
						id:imdb,
						name:$item.find('.original-name').text().replace(/\"/g,''),
						poster:endpoint+$item.find('.thumb img').attr('src'),
						year: $item.find('.year').text().replace(/\(|\)|\W/g,''),
						imdbRating: $item.find('.mp-rating-imdb').text().trim().split('/')[0],
						genres: $item.find('.genre').text().split(','),
						posterShape: 'regular',
						type:type=='filmes'?'movie':'series'
					})
				}
				resolve(metas);
			}else{
				reject();
			}
		});
	});
}

builder.defineCatalogHandler(function(args, cb) {
	// filter the dataset object and only take the requested type

	const cat = (args.extra || {}).genre ? args.extra.genre : false;
	const start = (args.extra || {}).skip ? Math.round(args.extra.skip / 10) + 1 : 1
	const type = args.type=='movie'?'filmes':'series'

	return new Promise((resolve, reject) => {
		Promise.all([getMoviesMRpiracy(start,type,cat), getMoviesMRpiracy(start+1,type,cat), getMoviesMRpiracy(start+2,type,cat), getMoviesMRpiracy(start+3,type,cat)]).then(function(values) {
			resolve({
				metas:[].concat.apply([], values),
				cacheMaxAge: cache.maxAge,
				staleError: cache.staleError
			});
		});
	});
});

function getStream(type,id,season,episode,pt=false){
	const path  = endpoint+'/'+type+'.php?imdb='+id+(pt?'PT':'')+season+episode+'#2';
	return new Promise((resolve, reject) => {
		request({
			method: 'HEAD',
			followRedirect: false,
			uri: path
		}, function (error, response, html) {
			if (response.statusCode==200){
				const stream = { externalUrl: path };
				if(pt){
					stream['title']='Português'
				}
				resolve(stream);
			}else resolve();
		});
	});
}

builder.defineStreamHandler(args => {
	const id = args.id.split(':')[0];
	const type = args.type=='movie'?'filme':'serie'
	const season = type=='serie'?'&t='+args.id.split(':')[1]:'';
	const episode = type=='serie'?'&e='+args.id.split(':')[2]:'';
	return new Promise((resolve, reject) => {
		Promise.all([getStream(type,id,season,episode), getStream(type,id,season,episode,true)]).then(function(values) {
			resolve({
				streams:[].concat.apply([], values)
			});
		});
	});
});

module.exports = builder.getInterface()