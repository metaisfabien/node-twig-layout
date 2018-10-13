/*!
 * twig-layout
 *
 * Copyright(c) 2018 Metais Fabien
 * MIT Licensed
 */
var Block = require('../block');

/**
 * Container block Object
 *
 * use to block and render them
 */
class Container extends Block {
  /**
   * Render the children blocks
   *
   * @return {string}
   */
  async render() {
    //get the children blocks
    var blocks = await this.layout.renderBlocks(this.name)
    var html = '';
    //add the html
    for (var parent in blocks) {
      html += blocks[parent];
    }

    return html
  }
}

module.exports = Container
