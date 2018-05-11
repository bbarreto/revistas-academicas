const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const https = require('https')
const request = require('request')
const requestPromise = require('request-promise')
const cheerio = require('cheerio')
const exphbs = require('express-handlebars')
const universidades = require('./universidades.json')

/** Configurando Express */
const app = express()
app.engine('handlebars', exphbs({defaultLayout: 'main'}));
app.set('view engine', 'handlebars');
app.use(bodyParser.urlencoded({ extended: false }))
app.use(cors())
app.set('port', (process.env.PORT || 5000))
app.use(express.static(__dirname + '/public'))

/** Endpoints das APIs */
app.get('/', function(request, response) {
  // Listar universidades
  response.render('home', {
    universidades: universidades
  })
})

app.get('/:entity_id', function (request, response) {
  // Listar revistas da universidade
  requestPromise({
    method: "GET",
    uri: universidades[request.params.entity_id].url,
    rejectUnauthorized: false,
    requestCert: true,
    agent: false
  }).then(body => {
    const page = cheerio.load(body)

    let magazines = [];

    page('h3').each((i, el) => {
      let magazine = {
        title: page(el).text(),
        description: null
      }

      if (page(el).next().attr("class") === 'journalDescription') {
        magazine['description'] = page(el).next().text().trim()
        magazine['link'] = page(el).next().next().find('a').first().attr('href')
      } else {
        magazine['link'] = page(el).next().find('a').first().attr('href')
      }

      if (magazine['link']) {
        magazine['id'] = (magazine['link']).replace(universidades[request.params.entity_id].url+'/', '')
      }

      magazines.push(magazine)
    });

    response.render('university', {
      universidades: universidades,
      entity: universidades[request.params.entity_id],
      magazines: magazines
    })
  }).catch(err => {
    response.send(JSON.stringify({ error: 'Unable to load '+universidades[request.params.entity_id].url, message: err.message, line: err.line }));
  });
})

app.get('/:entity_id/:magazine_id', function (request, response) {
  // Listar revistas da universidade
  let uri = `${universidades[request.params.entity_id].url}/${request.params.magazine_id}/issue/archive`;
  let pageNumber = 1;

  if (!isNaN(request.query.page)) {
    pageNumber = parseInt(request.query.page);
    uri = `${universidades[request.params.entity_id].url}/${request.params.magazine_id}/issue/archive?issuesPage=${request.query.page}`;
  }

  requestPromise({
    method: "GET",
    uri: uri,
    rejectUnauthorized: false,
    requestCert: true,
    agent: false
  }).then(body => {
    const page = cheerio.load(body)

    let issues = [];

    page('h3').each((i, el) => {
      let year = []

      page(el).parent().find('div').each((im, elm) => {
        if (page(elm).attr('id') && page(elm).attr('id').substr(0, 6)==='issue-') {
          let link = page(elm).find('h4 a').attr("href");
          year.push({
            id: parseInt(link.replace(`${universidades[request.params.entity_id].url}/${request.params.magazine_id}/issue/view/`, '')),
            title: page(elm).find('h4').text().trim(),
            link: link,
            image: page(elm).find('.issueCoverImage a img').attr("src"),
            description: page(elm).find('.issueCoverDescription').text()
          })
        }
      })

      issues.push({
        collection: page(el).text(),
        issues: year
      })
    });

    let totalPages = parseInt(page('#issues a').last().prev().prev().text())

    response.render('magazine', {
      universidades: universidades,
      entity: universidades[request.params.entity_id],
      magazine: request.params.magazine_id,
      issues: issues,
      page: pageNumber,
      totalPages: totalPages ? totalPages : pageNumber
    })
  }).catch(err => {
    response.send(JSON.stringify({ error: 'Unable to load '+universidades[request.params.entity_id].url, message: err.message, line: err.line }));
  });
})

app.get('/:entity_id/:magazine_id/:issue_id', function (request, response) {
  // Listar itens da revista
  requestPromise({
    method: "GET",
    uri: `${universidades[request.params.entity_id].url}/${request.params.magazine_id}/issue/view/${request.params.issue_id}/showToc`,
    rejectUnauthorized: false,
    requestCert: true,
    agent: false
  }).then(body => {
    const page = cheerio.load(body)

    let magazine = {
      title: page('h2').text(),
      issuedAt: page('h3').text(),
      content: []
    }

    page('#content h3, #content h4').each((i, el) => {
      let section = {
        title: page(el).text(),
        articles: []
      }

      let article = page(el).next();

      while (page(article).attr("class") === "tocArticle") {
        let item = {
          id: null,
          title: page(article).find('.tocTitle').text().trim(),
          authors: [],
          files: []
        }

        page(article).find('.tocGalleys a.file, .tocArticleGalleysPages a.file').each((fk, fi) => {
          item.id = page(fi).attr("href").split("/");
          item.files.push({
            id: item.id[item.id.length-1],
            title: page(fi).text(),
            view: page(fi).attr("href"),
            download: page(fi).attr("href").replace('/view/','/download/').replace('/viewIssue/','/download/')
          })

          item.id = item.id[item.id.length-2]
        });

        let authors = page(article).find('.tocAuthors').text().trim().split(",");
        for (let key = 0;key<authors.length;key++) {
          item.authors[key] = authors[key].trim();
        }

        item.authors = item.authors.filter(function(n){ return n != "" })

        section.articles.push(item)
        article = page(article).next()
      }

      magazine.content.push(section)
    });

    response.render('articles', {
      universidades: universidades,
      entity: universidades[request.params.entity_id],
      magazine: magazine
    })
  }).catch(err => {
    response.send(JSON.stringify({ error: 'Unable to load '+universidades[request.params.entity_id].url, message: err.message, line: err.line }));
  });
})


/** Iniciar servidor */
app.listen(app.get('port'), function() {
  console.log("Node app is running at localhost:" + app.get('port'))
})
