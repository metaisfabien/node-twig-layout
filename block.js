/*!
 * twig-layout
 *
 * Copyright(c) 2019 Metais Fabien
 * MIT Licensed
 */

/**
 * 
 * @typedef {Object} BlockConfig
 * @property {Array} blocks Children blocks to add
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
   * @param {Layout} layout Layout instance
   * @param {Object} options Block options
   * @param {string} options.name Block name
   * @param {string} options.html Block html
   * @param {BlockConfig} options.config Block config
   * @param {string} options.parent Block parnet name
   * @param {string} options.template Block tamplate path
   * @param {Cache} options.cache Cache instance
   */
  constructor (layout, options) {
    /**
     * Layout instance
     * @type {Layout}
     */
    this.layout = layout

    /**
     * template path
     * @type {string}
     */
    this.template = options.template

    /**
     * Config object
     * @type {Object}
     */
    this.config = options.config
    
    /**
     * block parent name take from config or options
     * @type {string}
     */
    this.parent = this.config.parent ? this.config.parent : options.parent

    /**
     * Block name
     * @type {string}
     */
    this.name = options.name

    /**
     * Block html
     * @type {string}
     */
    this.html = options.html

    /**
     * Block data object, it's the object passed to twig for render
     * @type {string}
     */
    this.data = options.data ? options.data : {}
     
    //bind block in data
    this.data.this = this;

    /**
     * Store children blocks from the config to add them after this block
     * @private
     */
    this._blocks = []
    /**
     * Block page path
     * @type {string|null}
     */
    this.page = this.config.page ? this.config.page : null

    /**
     * Cache instance
     * @type {Cache}
     * @private
     */
    this._cache = options.cache

    /**
     * Cache render key 
     * @type {string|null}
     * @private
     */
    this._cacheRenderKey = null

    /**
     * Cache render key prefix
     * @type {string}
     * @private
     */
    this._cacheRenderKeyPrefix = 'layout:block.render:'

    /**
     * Store the html cached of the block
     * @type {string}
     * @private
     */
    this._cacheRender = null

    /**
     * Cache render ttl 
     * @type {int|null}
     * @private
     */
    this._cacheRenderTtl = null

    //add children block
    if (this.config.blocks) {
      this.addBlocks(this.config.blocks)
    }
  }

  /**
   * Init callback
   * call at the end of construct
   */
  async init() {}

  /**
   * afterLoadChrildren hook
   * called after all blocks are loaded
   */
  async afterInitChildren() {}

  /**
   * AfterLoad hook
   * called after all blocks are loaded
   */
  async afterLoad() {}

  /**
   * beforeRender hook
   * Call before the render
   */
  async beforeRender() {}

  /**
   * Check if the block render is cached
   * @returns {Boolean}
   */
  async isCached() {
    if (!this._cache || !this.cache) {
      return false
    } else {
      return this._getCacheRender().then(cacheRender => {
        return cacheRender !== null ? true : false
      })
    }
  }

  /**
   * renturn the render from the cache
   * @returns {String}
   * @private
   */
  async _getCacheRender() {
    if (this._cacheRender === null) {
      //get the cache
      const cacheRender = await this._cache.get(this._getCacheRenderKey())
      //if is in cache
      if (cacheRender !== null && cacheRender !== undefined) {
        this._cacheRender = cacheRender
        return cacheRender
      }
      return null
    }

    return this._cacheRender
  }

  /**
   * Return the render cache key
   * 
   * @returns {String}
   * @private
   */
  _getCacheRenderKey() {
    if (!this._cacheRenderKey) {
      if (!this.template) {
        throw new Error ('A block has no cacheRenderKey and no template')
      } else {
      return this._cacheRenderKeyPrefix + this.template
      }
    } else {
      return this._cacheRenderKeyPrefix + this._cacheRenderKey
    }
  }

  /**
   *  Add many blocks
   *
   * @param {Array} blocks blocks configs array
   */
  addBlocks(blocks) {
    for (const key in blocks) {
      this.addBlock(blocks[key])
    }
  }

  /**
   * Add a block
   * All blocks are loaded by the layout
   * after this block init method is called
   *
   * @param {Object} block Block config
   * @private
   */
  addBlock(block) {
    this._blocks.push(block)
  }

  /**
   * return the children block to load after this block init
   */
  getChildrenBlock() {
    return this._blocks
  }

  /**
   * Get a block instance by name
   * 
   * @param {string} name Block name
   * @return {Block} Block instance
   */
  getBlock(name) {
    return this.layout.getBlock(name)
  }

  /**
   * Get parent block instance
   * 
   * @return {Block} Block instance
   */
  getParent() {
    return this.parent
  }

  /**
   * Render the block
   *
   * Render the children blocks and the block
   *
   * @return {string} Block html rendered
   */
  async render () {
    //if cache is disable render html
    if (!this._cache || !this.cache) { 
      return this._getHtml()
    } else {
      //try to get cache render
      const cacheRender = await this._getCacheRender()
      //if render is cached return it
      if (cacheRender !== null) {
        return cacheRender
      } else {
        //render html and cache it
        const html = await this._getHtml()
        let opts = {}

        //set ttl
        if (this._cacheRenderTtl) {
          opts.ttl = this._cacheRenderTtl
        }

        //save render in cache
        await  this._cache.set(this._getCacheRenderKey(), html, opts)
        return html
      }
    }
  }

  /**
   * Render block and return html
   * 
   * @returns {string} Block html rendered
   * @private
   */
  async _getHtml() {
    if (!this.html) {
      return ''
    }
    return this.layout.renderHtml(this.html, this.data).catch((error) => {
      this.layout.emit('error', error, { block: this.name, html: this.html })
      return ''
    })
  }
}

module.exports = Block
