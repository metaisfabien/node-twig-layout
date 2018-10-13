## twig-layout

twig-layout is a layout system based on twig.

## Instalation

```bash
$ npm install twig-layout
```

## Exemple:

This exemple use express and express-twig-layout

install express and express-twig-layout

```bash
$ npm install --save express 
$ npm install --save express-twig-layout
```

## index.js
Create a simple express app with two route: /home and /test
```js
var express = require('express')
var layout = require('express-twig-layout')
var app = express()

//set the views directory
app.set('view', './views')
app.use(layout())

//home route
app.get('/home', function (req, res) {
  //load the layout from the file home.html
  req.layout.loadTemplate('home.html').then(() => {
    //send the layout html
    req.layout.render().then((html) => {
      res.send(html)
    })
  })
})

//test route
app.get('/test', function (req, res) {
  //load the layout from the file test.html
  req.layout.loadTemplate('test.html').then(() => {
    //Set the title of the block head
    req.layout.getBlock('head').data.title = 'Test page'
    //send the layout html
    req.layout.render().then((html) => {
      res.send(html)
    })
  })
})

app.get('*', function (req, res) {
  res.redirect('/home')
})

app.listen(3000, function () {
  console.log('Example app listening on port 3000!')
})
```

## /views/page/default.html
The template for the page
For the template syntax read the twig js [documentation](https://github.com/twigjs/twig.js/wiki) 
```html
<template>
    <!doctype html>
    <html lang="en">
    <!-- block head -->
    {{blocks.head}}
    <body>

    <header>
        <nav>
            <ul>
                <li>
                    <a href="/home">Home</a>
                </li>
                <li>
                    <a href="/test">Test</a>
                </li>
            </ul>
        </nav>
    </header>
    <main role="main">
        <!-- block content -->
        {{blocks.content}}
    </main>

    <footer>
        <p>footer</p>
    </footer>
    </body>
    </html>
</template>
<script>
  //Require the block dependency
  var Block = require('node-twig-layout/block')

  //Block for the page
  class Default extends Block {
    init () {
      //set the name of the block
      //the name of the block can be define in this way or for other block it can be defined in the config
      this.name = 'page'

      //Head block
      this.addBlock({name: 'head', template: 'page/head.html'})

      //content block it just a block container
      //to use block with no html temple use type
      this.addBlock({name: 'content', script: 'container'})
    }

    /**
     * before render callback
     */
    beforeRender () {
      //Add a css file
      this.layout.getBlock('head').addCss('https://stackpath.bootstrapcdn.com/bootstrap/4.1.3/css/bootstrap.min.css', -10)
    }
  }

  module.exports = Default
</script>
```  

## /views/page/head.html
template for the head block define in the file views/page/default.html
```html
<template>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
        <meta name="description" content="">
        <meta name="author" content="">

        <title>{{title}}</title>
        {% for file in css %}
        <link rel="stylesheet" href="{{file}}">
        {% endfor %}

        {% for file in js %}
        <script src="{{file}}"></script>
        {% endfor %}
    </head>
</template>
<script>
  //requite the block object
  var Block = require('node-twig-layout/block')

  //A Test class for the test page
  class Head extends Block {
    /**
     * Init method
     */
    init() {
      //unsorted array
      this._css = []
      this._js = []

      //data array for render
      this.data.css = []
      this.data.js = []
    }

    //add css files
    addCss (cssFiles, weight = 0) {
      if (Array.isArray(cssFiles)) {
        for (var key in cssFiles) {
          this._css.push({weight: weight, file: cssFiles[key]})
        }
      } else if (typeof cssFiles === 'string') {
        this._css.push({weight: weight, file: cssFiles})
      } else {
        throw Error('Invalid addCss argument')
      }
    }

    //add js files to the data object
    addJs (jsFiles) {
      if (Array.isArray(jsFiles)) {
        for (var key in jsFiles) {
          this._js.push({weight: weight, file: jsFiles[key]})
        }
      } else if (typeof jsFiles === 'string') {
        this._js.push({weight: weight, file: jsFiles})
      } else {
        throw Error('Invalid addJs argument')
      }
    }

    /**
     * Before render callback
     */
    beforeRender() {
      var sort = function(a, b) {
        return a.weight - b.weight
      }
      this._css.sort(sort);
      for (const key in this._css)
        this.data.css.push(this._css[key].file)

      this._js.sort(sort);
      for (const key in this._js)
        this.data.js.push(this._js[key].file)
    }
  }

  module.exports = Head
</script>
```  

## /views/home.html
The template for the /home route
```html
<template>
    <div>
        <h1>Home page</h1>
    </div>
</template>
<script>
  //requite the block object
  var Block = require('node-twig-layout/block')

  //A Block class for the home page
  class Home extends Block {
    init () {
      this.page ='page/default.html'
      //name of the parent block of this block
      //here the block content, it is defined in the file page/default.html
      this.parent = 'content'
    }

    beforeRender() {
      this.layout.getBlock('head').data.title = 'Home page'
    }
  }

  module.exports = Home
</script>
```
## /views/test.html
The template for the /test route
```html
<template>
    <div class="test">
        <h1>Test</h1>
    </div>
</template>
<script>
  //requite the block object
  var Block = require('node-twig-layout/block')

  //A Test class for the test page
  class Test extends Block {
    init () {
      this.page ='page/default.html'
      //name of the parent block of this block
      //here the block content, it is defined in the file page/default.html
      this.parent= 'content'
    }
  }

  module.exports = Test
</script>
```  

## Run:
```bash
$ node index.js
```
