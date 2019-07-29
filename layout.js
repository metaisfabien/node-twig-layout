/*!
 * twig-layout
 *
 * Copyright(c) 2018 Metais Fabien
 * MIT Licensed
 */

const twig = require('twig')
const stringHash = require('string-hash')

const EventEmitter = require('events')
const {promisify} = require('util')

const path = require('path')
const fs = require('fs')
const utils = require('@midgar/utils')

const Block = require('./block')
/**
 * Cache object use standard functions you'd expect in most caches
 * 
 * @typedef {Object} Cache
 * @property {function(string, *):undefined} set Set something in cache
 * @property {function(string):*} get Get something from cache
 * @property {function(string):*} detl Delete from cache
 */

/**
 * Layout Class
 * Manage blocks
 */
class Layout extends EventEmitter {

  /**
   * @param {Object} options Layout options
   * @param {Cache} options.cache Cache instance
   * @param {string} options.tmpDir temp dir to write block in file and require them
   * @param {string} options.views Path to the views dir
   */
  constructor(options) {
    super()
    //options
    this._options = Object.assign({
      cache: false,
      tmpDir: null,
      sourceMap: false,
      mode: 'tmpfile',
      views: '',
    }, options)


    if (!this._options.tmpDir) 
      throw new Error('No temp dir set')

    //
    /**
     * Store blocks instance by name
     * @type {Object}
     */
    this.blocks = {}

    /**
     * Store the block instance by parent
     * @type {Object}
     * @private
     */
    this._blocks = {}


    /**
     * Define if render a page or juste template block
     * @type {boolen}
     */
    this.renderPage = true

    /**
     * Template block instance
     * @type {Block}
     * @private
     */
    this._templateBlock = null

    /**
     * Cache instance
     * @type {Cache}
     * @private
     */
    this._cache = options.cache

    /**
     * Cache key prefix
     * @type {string}
     * @private
     */
    this._cacheFilePrefix = 'layout:'
  }

  /**
   * Extend twig and init cache
   */
  async init() {
    await Promise.all([this._extendTwig(), this._initCache()])
  }

  /**
   * Extend twig with options extendFilter and extendFunction
   * @private
   */
  async _extendTwig() {
    const extendFilters = this._options.extendFilters || {}
    const extendFunctions = this._options.extendFunctions || {}

    await Promise.all([this.extendTwigFilters(extendFilters),this.extendTwigFunctions(extendFunctions)])
  }

  /**
   * Extend twig filters
   * 
   * @param {Object} extendFilters filters object {name: filter function, ...}
   */
  async extendTwigFilters(extendFilters) {
    //list filers
    await utils.asyncMap(extendFilters, async (filter, name) => {
      //add filter
      this.extendTwigFilter (name, filter)
    })
  }

  /**
   * Extend twig functions
   * 
   * @param {Object} extendFilters filters object {name: filter function, ...}
   */
  async extendTwigFunctions(extendFunctions) {
    //list functions
    await utils.asyncMap(extendFunctions, async (fn, name) => {
      //add function
      this.extendTwigFunction (name, fn)
    })
    
    this.extendTwigFunction ('getBlockHtml', (name) =>  this.getBlockHtml(name))
  }
  
  /**
   * Extend twig filter
   * 
   * @param {String}   name   filter name
   * @param {Function} filter filter function
   */
  extendTwigFilter (name, filter) {
    twig.extendFilter(name, filter)
  }

 /**
  * Extend twig function
  * 
  * @param {String}   name function name
  * @param {Function} fn   function
  */
  extendTwigFunction (name, fn) {
    twig.extendFunction(name, fn)
  }

  /**
   * Check if the cache dir exist and create it
   * @private
   */
  async _initCache() {
    //if cache
        
      //check if cache dir exist
      const exists = await utils.asyncFileExists(this._options.tmpDir)
      if (!exists) {
        //create cache dir
        await utils.asyncMkdir(this._options.tmpDir)
      }
  }

  /**
   * Load a template file
   *
   * @param {string} template Template path relative to the views dir
   * @param {Object} config   Block config
   * @param {Object} config.script Block script path
   */
  async loadTemplate(template, config = {}) {
    //reset blocks arrays
    this._blocks = {}
    this.blocks = {}      
    
    //path of the block script
    let script = config.script ? config.script : null

    //Load the template block
    const block = await this._loadBlock('', template, config, script, null)
  
    this._templateBlock = block
    if (!block) {
      throw new Error('Cannot load the main template: ' + template)
    }

    // Check if the page is defined
    if (this.renderPage && !block.page) {
      throw new Error('Page is not defined in the layout config for the block ' + template)
    }

    //load the page block
    if (this.renderPage) {
      //load the page block
      const pageBlock = await this._loadBlock('page', block.page, {}, null, 'root')

      if (!pageBlock) {
        throw new Error('Cannot load the page template: ' + block.page)
      }

      this._pageBlock = pageBlock
    }

    await this._afterLoad()
  }

  /**
   * Call the afterLoad Callbacks on all the blocks
   * @private
   */
  async _afterLoad() {
    //promises array
    const afterLoads = []

    //add the promises
    for (const name in this.blocks)
      afterLoads.push(this.blocks[name].afterLoad())

    //wait the endprivate
    return Promise.all(afterLoads)
  }

  /**
   * load blocks from the config
   *
   * @param {Array} blocks blocks config
   * @param {string} parent block name
   * @private
   */
  async _loadBlocks(blocks, parent) {
    const loadBlocks = []
    for (let key in blocks) {
      const config = blocks[key]
/*
      if (!config.name) {
        throw new Error('A block have no name: ' + JSON.stringify(config))
      }
*/
      if (this.blocks[config.name]) {
        throw new Error('The block  ' + config.name + ' is already defined')
      }

      if (!config.template && !config.script) {
        throw new Error('The block  ' + config.name + ' have no template and no script')
      }

      // if the block has no parent set it to root
      if (config.parent) {
        parent = config.parent
      } else if (!parent) {
        parent = 'root'
      }

      //path of the block script
      let script = config.script ? config.script : null
      let data = config.data ? config.data : null

      //load the block
      loadBlocks.push(this._loadBlock(config.name, config.template, data, config, script, parent))
    }

    return Promise.all(loadBlocks)
  }

  /**
   * load a block
   *
   * @param {string} name block name
   * @param {string} template template path
   * @param {Object} config block config object
   * @param {string} script path of the block script file (.js)
   * @param {string} parent block name
   *
   * @return Block
   *
   * @private
   */
  async _loadBlock(name, template, data, config, script, parent) {
    //check if the block have no name and no template connot load the block
    if (!name && !template) {
      let error = new Error('A block have no name and no template')
      this.emit('error', error, {})
      return null
    }

    let block = null
    try {
      //create block
      block = await this.createBlock({ name, template, data, config, script, parent })
    } catch (error) {
      const params = {} 
      if (error.code != 'ENOENT') {
        if (name) params.block = name
        if (template) params.template = template
        if (script) params.script = script
      } else {
        if (parent) params.block = parent
      }

      this.emit('error', error, params)
      return null
    }

    if (!block) 
      return null
    
    if (!block.name) {
      this.emit('error', 'A block have no name', {template: template, script: script})
      return null
    }

    if (this._blocks[block.parent] == undefined) {
      this._blocks[block.parent] = []
    }

    //store the block instance
    this._blocks[block.parent].push(block)
    this.blocks[block.name] = block

    return block
  }

  /**
   * Load a block class from a js file
   *
   * @param {Object} options  block options
   * @param {string} template template file path
   *
   * @return {Block}
   * @private
   */
  async _loadBlockClass(options, template) {
    let BlockClass = null
    const html = template && template.html ? template.html : null
    
    if (!template || !template.script) {
      //if the template contain no block class try to use the script
      if (options.script) {
        BlockClass = await utils.asyncRequire(options.script)
      } else {
        //if no block class found use a Block class
        BlockClass = Block
      }
    } else {
      BlockClass = template.script
    }

    //if the file exist require the file and return it
    return this._createBlockInstance(BlockClass, options, html)
  }

  /**
   * Create the block instance
   *  
   * @param {constructor} BlockClass  block constructor
   * @param {Object} options Block options
   * @param {string} options.name Block name
   * @param {string} options.parent Block parent name
   * @param {string} options.template Block template path
   * @param {String} html 
   * @private
   */
  async _createBlockInstance(BlockClass, options, html) {
    try {
      //create the block instance
      const block = new BlockClass(this, {
        name: options.name, 
        html: html, 
        config: options.config || {},
        parent: options.parent,
        data: options.data,
        template: options.template || null,
        cache: this._cache
      })

      try {
        await block.init()
      } catch (error) {
        const params = {} 
        if (options.name) params.block = options.name
        if (options.template) params.template = options.template
        if (options.script) params.script = options.script
        this.emit('error', 'connot init block')
        this.emit('error', error, params)
  
        return null
      }

      await this._afterInitBlock(block)

      //if block have no html and no template in his option
      //and have a temple on his instance load it
      if (!block.html && !options.template && block.template) {
        const template = await this._loadTemplate(block.template)
        if (template.html)
          block.html = template.html
      }
      
      return block
    } catch (error) {
      console.log(error)
      throw error
    }
  }

  /**
   * Call afterInit callback and load child block
   * 
   * @param {*} block 
   */
  async _afterInitBlock(block) {
    if (!block)
      return null
    
    const childrenBlock = block.getChildrenBlock()
    //load children block
    if (childrenBlock && childrenBlock.length) {
      await this._loadBlocks(childrenBlock, block)
    }

    //after init children hook
    await block.afterInitChildren()
  }

  /**
   * Put the html and the script in a cache file
   * @param {*} template 
   * @param {*} content 
   */
  async _cacheTemplate (template, content) {
    if (!content) 
      return null
      
    const promises = []
    if (content.script) {
      promises.push(this._cacheFile(template + '.js', content.script))
    }

    if (content.html) {
      promises.push(this._cacheFile(template + '.html', content.html))
    }

    await Promise.all(promises)
  }

  /**
   * Open a template file
   * search for template and script tags
   * 
   * return and object with html and scipt
   * 
   * @param {String} template tamplate path
   * 
   * @returns {Object}
   */
  async _loadFileTemplate(templateContent) {
    let html = ''
    let script = null

    if (!templateContent) 
      return null

    
    //search for the <template> part
    const templateTags = templateContent.match(/<template>([\s\S]*?)<\/template>/g)
    //if there are a <template> tag
    if (templateTags && templateTags[0]) {
      //get the html
      html = templateTags[0].replace(/<\/?template>/g, '')
      //remove the <template> part of the template content
      templateContent = templateContent.substring(templateTags[0].length)


      //search for a <script> part
      const scriptTags = templateContent.match(/<script(?:[\s\S]*?)>([\s\S]*?)<\/script>/g)
      if (scriptTags && scriptTags[0]) {
        //get the script class and eval it
        script = scriptTags[0].replace(/<\/?script(?:[\s\S]*?)>/g, '')
      }
    }

    //if no template tag and no script tag
    if (!html && !script) {
      return {html: templateContent}
    } else {
      return {html, script}
    }
  }

  /**
   * load a template file and return the html and the Block class
   *
   * @param {string} template template path
   *
   * @return {Array}
   * @private
   */
  async _loadTemplate(template) {
    let Block = null;
    if (this._options.mode == 'tmpfile') {
      //if use cache load template from cache if it cached
      Block = await this._loadTmpBlock(template)
    }
   

    let html = null
    if (this._options.cache) {
       html = await this._getCacheFile(template)
    }
    
    if (html == null || Block === null) {

      //get the template content
      let templateContent = await this.getTemplateContent(template)
      const content = await this._loadFileTemplate(templateContent)
      html = content.html

      if (Block !== null) {
        content.script = Block
      } else if (content.script) {
        content.script = await this._createTmpBlock(template, templateContent, content.script)
      }

      if (this._options.cache && html !== null)
        await this._cacheFile(template, html)

      return content
    } else {
      return {html, script: Block}
    }
  }

  /**
   * Create the js file in the temp folder
   * 
   * @param {*} filePath 
   * @param {*} templateContent 
   * @param {*} content
   * @private
   */
  async _createTmpBlock(filePath, templateContent, content) {
    //get a hash of the file path
    const hash = stringHash(filePath)
    //temp file path
    const newFilePath = path.join(this._options.tmpDir, hash.toString() + '.js')

    //if source map is enable generate it and update content to load sourcemap
    if (this._options.sourceMap) {
      let sourcemap = await this._getSourceMap(templateContent, content, filePath, newFilePath)

      await utils.asyncWriteFile(newFilePath + '.map', sourcemap)
     // s = Buffer.from(s).toString('base64')

      content = "require('source-map-support').install({environment: 'node', hookRequire: true});" + content +"\n//# sourceMappingURL=" + newFilePath + '.map' //data:application/json;" + s

    }


    let Block = null
    if (this._options.mode == 'tmpfile') {
      //create tmp file
      await utils.asyncWriteFile(newFilePath, content)

      try {
        Block = require(newFilePath)
      } catch (error) {
        console.log(error)
      }
    } else if (this._options.mode == 'eval') {
      try {
        const nodeEval = require('node-eval');
        Block = nodeEval(content, filePath)
      } catch (error) {
        console.log(error)
      }
    }

    return Block
  }

  /**
   * Create a source map file for the block scripts
   * 
   * @param {string} templateContent Original template content
   * @param {string} content         Script tag content
   * @param {string} filePath        Template file path
   * @param {string} newFilePath     Temp script file path
   * @private
   */
  async _getSourceMap(templateContent, content, filePath, newFilePath) {
     //get start js part index
     const index = templateContent.indexOf(content)
     //get non js part
     const tempString = templateContent.substring(0, index)
     const lineNumber = tempString.split('\n').length
 
     const esprima            = require('esprima');
     const SourceMapGenerator = require('source-map').SourceMapGenerator;
 
     const map = new SourceMapGenerator({ 
       file: filePath
     })
 
     const tokens = esprima.tokenize(content, { loc: true })
 
     let offset = lineNumber - 1
  
     tokens.forEach(function(token) {
       const loc = token.loc.start
 
       map.addMapping({
         source: filePath,
         //add lineNumber offset
         original: {line: loc.line + offset, column: loc.column},
         generated: {line: loc.line, column: loc.column}
       })
     })
   
     return map.toString()
  }

  /**
   * Try to require a temp block module
   *
   * @param {string} filePath Original file path
   * @private
   */
  async _loadTmpBlock(filePath) {
    //get a hash of the file path
    const hash = stringHash(filePath)
    let Block = null
    try {
      Block = require(path.join(this._options.tmpDir, hash + '.js'))
    } catch (error) {
      //Prevent error if the file not exists
      if(error.code != 'MODULE_NOT_FOUND') {
        throw error
      }
    }

    return Block
  }

  /**
   * 
   * @param {*} filename 
   */
  async _getCacheFile(filename) {
    return this._cache.get(this._cacheFilePrefix + filename)
  }

  /**
   * 
   * @param {*} filename 
   * @param {*} content 
   */
  async _cacheFile(filename, content) {
    return this._cache.set(this._cacheFilePrefix + filename, content)
  }

  /**
   * Create a Block instance
   *
   * @param {Object} options block params
   *
   * @return Block
   */
  async createBlock(options) {
    //if the block have a templete
    if (options.template) {
      const template = await this._loadTemplate(options.template)
      return this._loadBlockClass(options, template)
    }

    return this._loadBlockClass(options)
  }

  /**
   * Return a Block instance by name
   *
   * @param {Sting} name block name
   *
   * @returns Block
   */
  getBlock(name) {
    if (this.blocks[name] != undefined) {
      return this.blocks[name]
    } else {
      throw new Error('The block ' + name + ' doesn\'t exist')
    }
  }

  /**
   * Render child blocks of the parent
   * and return and object contain blocks html
   *
   * @param {string} parent block parent name
   *
   * @return Object
   */
  async renderBlocks(parent) {
    const renders = []
    for (let key in this._blocks[parent]) {
      const block = this._blocks[parent][key]
      renders[block.name] = block.render().catch(async (error) => {
        this.emit('error', error, { block: block.name })
        //return { key: block.name, value: ''} //continue other blocks
      })
    }
    
    return utils.objectPromises(renders)
  }

  /**
   * Return the block html
   * 
   * @param {Sting} name block name
   * 
   * @returns {String}
   */
  async getBlockHtml(name) {
    try {
      const block = this.getBlock(name)
      return block.render().catch(async (error) => {
        this.emit('error', error, { block: block.name })
        //return { key: block.name, value: ''} //continue other blocks
      })
    } catch (error) {

    }
  }

  /**
   * Render a html template with twig
   *
   * @param {string} html html to render
   * @param {Object} data data object of the template
   *
   * @return String
   */
  async renderHtml(html, data) {
    try {
      return twig.twig({
        data: html,
        rethrow: true,
        allow_async: true
      }).renderAsync(data)
    } catch (error) {
      this.emit('error', error, { html: html })
    }
  }

  /**
   * Render a template file
   *
   * @param {string} file template path
   * @param {Object} data data object of the template
   *
   * @return String
   */
  async renderFile(file, data) {
    const html = await this.getTemplateContent(file)
    if (!html) {
      return ''
    }

    //get the template content and render it
    return this.renderHtml(html, data)
  }

  /**
   * Return the content of a template
   *
   * @param {string} file template path
   *
   * @return {string}
   * @private
   */
  async getTemplateContent(file) {
    const filePath = path.join(this._options.views, file);
    const exists = await utils.asyncFileExists(filePath)
    if (exists) {
      return promisify(fs.readFile)(filePath, 'utf8')
    } else {
      throw new Error ('file not found: ' + file)
    }
  }

  /**
   * Render the block page
   *
   * @return {string}
   */
  async render() {
    //call before render hook
    await utils.asyncMap(this.blocks, async block => {
      if (block.beforeRender) {
        const isCached = await block.isCached()
        if (!isCached) {
          try {
            await block.beforeRender()
          } catch (error) {
            this.emit('error', error, { block: block.name })
          }
        }
      }
    })

    if (this.renderPage) {
      return this._pageBlock.render()
    } else {
      return this._templateBlock.render()
    }
  }
}

module.exports = Layout