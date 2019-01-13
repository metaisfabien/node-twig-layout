/*!
 * twig-layout
 *
 * Copyright(c) 2018 Metais Fabien
 * MIT Licensed
 */
var Block = require('../block');

/**
 * Container block Object
 * Use to store blocks and render them
 */
class Container extends Block {
  /**
   * Render the children blocks
   *
   * @return {string}
   */
  async render() {
    //get the children blocks
    const blocks = await this.layout.renderBlocks(this.name)
    let html = '';
    //add the html
    for (const parent in blocks) {
      html += blocks[parent];
    }
    return html
  }
}

module.exports = Container
