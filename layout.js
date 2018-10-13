/*!
 * twig-layout
 *
 * Copyright(c) 2018 Metais Fabien
 * MIT Licensed
 */

var twig = require('twig')
var path = require('path')
var fs = require('fs')

var Block = require('./block')

/**
 * Layout Object
 *
 * Load the blocks and render them
 */
class Layout {
  constructor (options) {
    //options
    this.options = options || {}

    //store the block instance by name
    this.blocks = {}

    //store the block instance by parent
    this._blocks = {}

    //template loading state
    this.isLoad = false
  }

  /**
   * load a template file
   *
   * @param blocks
   */
  async loadTemplate (template, config) {
    config = config || {}
    //reset blocks arrays
    this._blocks = {}
    this.blocks = {}

    //Load the template block
    var block = await this._loadBlock('', template, config, null, null)

    // Check if the page is defined
    if (!block.page) {
      throw new Error(
        'Page is not defined in the layout config for the block ' + template)
    }

    //load the page block
    this._pageBlock = await this._loadBlock('page', block.page, {}, null,
      'root')

    //call after load callbacks
    await this._afterLoad()

    // execute the page block actions
    if (this._pageBlock.config.actions) {
      this._processActions(this._pageBlock.config.actions)
    }

    // execute the blocks actions
    if (block.config.actions) {
      this._processActions(block.config.actions)
    }

    //set the template is loaded
    this.isLoad = true
  }

  /**
   * Call the afterLoad Callbacks on all the blocks
   *
   * @return {<void>}
   * @private
   */
  async _afterLoad() {
    //promises array
    var afterLoads = []

    //add the promises
    for (var name in this.blocks)
      afterLoads.push(this.blocks[name].afterLoad())

    //wait the end
    await Promise.all(afterLoads)
  }

  /**
   * load blocks from the config
   *
   * @param {Array} blocks blocks config
   * @param {string} parent block name
   *
   * @private
   */
  _loadBlocks (blocks, parent) {
    var loadBlocks = []
    for (var key in blocks) {
      var config = blocks[key]

      if (!config.name) {
        throw new Error('A block have no name: ' + JSON.stringify(config))
      }

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
      var script = config.script ? config.script : null

      //load the block
      loadBlocks.push(this._loadBlock(config.name, config.template, config, script, parent))
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
  async _loadBlock (name, template, config, script, parent) {
    //if the block have no name and a template
    //get the name of the template file for name
    if (!name && template) {
      name = template.replace(path.extname(template), '')
    }

    //check if the block have a name
    if (!name) {
      throw new Error('A block have no name and no template')
    }

    //create the block instance
    var block = await this.createBlock({name: name, template: template,config: config, script: script, parent: parent})

    if (this._blocks[block.parent] == undefined) {
      this._blocks[block.parent] = []
    }

    //store the block instance
    this._blocks[block.parent].push(block)
    this.blocks[block.name] = block

    //load the children blocks define in the block config
    if (block.config.children != undefined &&
      Array.isArray(block.config.children)) {
      this._loadBlocks(block.config.children, block.name)
    }

    return block
  }

  /**
   * Load a block class from a js file
   *
   * @param {string} script block file path
   *
   * @return {*}
   *
   * @private
   */
  _loadBlockClass(script) {
    var filePath = script + '.js'

    //the block is in the block directory or in the path define in this.options.blocks
    var dirs = []
    if (this.options.blocks) dirs.push(this.options.blocks)
    dirs.push(__dirname + '/blocks')

    for (var key in dirs) {
      var dir = dirs[key]

      //if the file exist require the file and return it
      if (fs.existsSync(path.join(dir, filePath))) {
        return require(path.join(dir, filePath))
      }
    }

    //if no file is found
    throw new Error('Invalid block script ' + script)
  }

  /**
   * load a template file and return the html and the Block class
   *
   * @param {string} template template path
   *
   * @return {Array}
   * @private
   */
  _loadTemplate (template) {
    var html = ''
    var BlockClass = null
    //get the template content
    var templateContent = this.getTemplateContent(template)

    //search for the <template> part
    var templateTags = templateContent.match(/<template>([\s\S]*?)<\/template>/g)

    //if there are a <template> tag
    if (templateTags && templateTags[0]) {
      //get the html
      html = templateTags[0].replace(/<\/?template>/g, '')

      //remove the <template> part of the template content
      var scriptContent = templateContent.substring(templateTags[0].length)

      //search for a <script> part
      var scriptTags = scriptContent.match(/<script>([\s\S]*?)<\/script>/g)
      if (scriptTags && scriptTags[0]) {
        //get the script class and eval it
        var script = scriptTags[0].replace(/<\/?script>/g, '')
        BlockClass = eval(script)
      }
    } else {
      //if there a no <template> part get all the content
      html = templateContent
    }

    return [html, BlockClass]
  }

  /**
   * Create a Block instance
   *
   * @param {Object} options block params
   *
   * @return Block
   */
  async createBlock (options) {
    var html = ''
    var BlockClass = null

    //if the block have a templete
    if (options.template) {
      var tpl = this._loadTemplate(options.template)
      html = tpl[0]
      BlockClass = tpl[1]
    }

    if (!BlockClass) {
      //if the template contain no block class try to use the script
      if (options.script) {
        BlockClass = this._loadBlockClass(options.script)
      } else {
        //if no block class found use a Block class
        BlockClass = Block
      }
    }

    //create the instance
    var block = new BlockClass(options.name, html, options.config || {}, options.parent, this)
    await block.init()

    // load blocks
    if (block.blocks) {
      await this._loadBlocks(block.blocks, block.name)
    }

    return block
  }

  /**
   * Return a Block instance by name
   *
   * @param name
   *
   * @returns Block
   */
  getBlock (name) {
    if (this.blocks[name] != undefined) {
      return this.blocks[name]
    } else {
      throw new Error('The block ' + name + ' doesn\'t exist')
    }
  }

  /**
   * Exec the actions of a layout config
   *
   * read the config object and exec actions
   *
   * @param config
   *
   * @private
   */
  _processActions (config) {
    for (var name in this.blocks) {
      var block = this.blocks[name]
      if (config[block.name] != undefined) {
        this._execActions(block.name, config[block.name])
      }
    }
  }

  /**
   * Exec the actions of a block
   *
   * @param blockName
   * @param actions
   *
   * @private
   */
  _execActions (blockName, actions) {
    //get the block instance
    var block = this.getBlock(blockName)
    for (var key in actions) {
      var action = actions[key]

      //if the action have no method
      if (!action.method) {
        throw new Error('Invalid action in the block ' + blockName)
      }

      //check of the block have the method defined
      if (block[action.method] == undefined) {
        throw new Error(
          'The block ' + blockName + ' (' + block.script + ') have no method ' + action.method)
      }

      //call the method
      if (action.args != undefined) {
        block[action.method].apply(block, action.args)
      } else {
        block[action.method]()
      }
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
  async renderBlocks (parent) {
    //promises array
    var renders = []

    //Add the render proomise for each child blocks
    for (var key in this._blocks[parent])
      renders.push(this._blocks[parent][key].render())

    //wait the result
    var result = await Promise.all(renders)

    var blocks = {}
    var i = 0
    //add the html in an object with the block name for key
    for (var key in this._blocks[parent]) {
      var block = this._blocks[parent][key]
      blocks[block.name] = result[i]
      i++
    }

    return blocks
  }

  /**
   * Render a html template with twig
   *
   * @param {string} html html to render
   * @param {Object} data data object of the template
   *
   * @return String
   */
  renderHtml (html, data) {
    try {
      return twig.twig({data: html}).render(data)
    } catch (e) {
      console.log(e)
      console.log(html)
      return ''
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
  renderFile (file, data) {
    try {
      //get the template content and render it
      return this.renderHtml(this.getTemplateContent(file), data)
    } catch (e) {
      throw new Error('Error in template ' + file)
    }
  }

  /**
   * Return the content of a template
   *
   * @param {string} file template path
   *
   * @return {string}
   * @private
   */
  getTemplateContent (file) {
    return fs.readFileSync(path.join(this.options.views, file), 'utf8')
  }

  /**
   * Render the block page
   *
   * @return {string}
   */
  render () {
    if (!this.isLoad) throw new Error ('Layout is not loaded')
    return this._pageBlock.render()
  }
}

module.exports = Layout