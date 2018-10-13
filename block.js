/*!
 * twig-layout
 *
 * Copyright(c) 2018 Metais Fabien
 * MIT Licensed
 */

/**
 * Block Object
 *
 * use to store html and template data
 * and render them
 */
class Block {
  /**
   * Constructor
   *
   * @param {string} name name
   * @param {string} html html template
   * @param {Object} config block config
   * @param {string} parent block parent name
   * @param {Layout} layout layout instance
   */
  constructor (name, html, config, parent, layout) {
    //layout instance
    this.layout = layout

    //block parent name overwritted by the config
    this.parent = config.parent ? config.parent : parent

    //block name
    this.name = name

    //html template
    this.html = html
    this.config = config
    this.data = {}
    this.blocks = []
    this.page = config.page ? config.page : null

    this.extend()

    if (this.config.blocks) {
      this.addBlocks(this.config.blocks)
    }
  }

  /**
   * Init callback
   * call at the end of construct
   */
  async init () {}

  /**
   * AfterLoad call back
   * called after all blocks are loaded
   */
  async afterLoad () {}

  /**
   * Before render callback
   */
  async beforeRender () {}

  /**
   *  Add many blocks
   *
   * @param {Array} blocks blocks configs array
   */
  addBlocks(blocks) {
    for (var key in blocks) {
      this.addBlock(blocks[key])
    }
  }

  /**
   * Add a block
   * All blocks are loaded by the layout
   * after this block instance is created
   *
   * @param {Object} block Block config
   */
  addBlock(block) {
    this.blocks.push(block)
  }

  /**
   * Render the block
   *
   * Render the children blocks and the block
   *
   * @return {String}
   */
  async render () {
    await this.beforeRender()
    this.data.blocks = await this.layout.renderBlocks(this.name)
    return this.layout.renderHtml(this.html, this.data)
  }

  /**
   * Extend the block Object from the layout config
   * Extend the template data Object from the layout config
   *
   * Used to define methods to use them in the Block or in the html template
   */
  extend () {
    var extend = this.layout.options.extendBlock || {}
    Object.assign(this, extend)

    var extend = this.layout.options.extendTemplate || {}
    Object.assign(this.data, extend)
  }
}

module.exports = Block
