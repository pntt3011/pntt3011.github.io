const WIDTH = 829;
const HEIGHT = 714;

function genMeme() {
    let text = document.getElementById('input-text').value;
    loadInputAndGenMeme(text)
}

function loadInputAndGenMeme(text) {
    let source = document.getElementById('meme-src');
    let img = new Image();
    img.crossOrigin = "anonymous";
    
    img.onload = function() {
        let dataURL = addText(img, text)
        showResult(dataURL)
    };
    img.src = source.src;
}

function addText(img, text) {
    let canvas = document.getElementById('canvas');
    let ctx = canvas.getContext('2d');

    canvas.width = img.width;
    canvas.height = img.height;
    
    // Draw the image
    ctx.drawImage(img, 0, 0);
    
    // Draw the texts
    let fontFamily = "Comic Sans MS";
    drawTitle(ctx, text, img, fontFamily);
    drawRight(ctx, text, img, fontFamily);
    drawLeft(ctx, text, img, fontFamily);
    
    return canvas.toDataURL();
}

function drawTitle(ctx, text, img, fontFamily) {
    let fontSize = img.height / 13;
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.fillStyle = 'white';

    let textRect = { x: 0, y: 0, w: img.width, h: img.height * (100 / HEIGHT)}
    ctx.fillTextCenter(text, textRect, fontSize * 1.5);
}

function drawRight(ctx, text, img, fontFamily) {
    let fontSize = img.height / 20;
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.fillStyle = 'black';

    let textRect = { x: img.width * (645 / WIDTH), y: img.height * (193 / HEIGHT), w: img.width * (175 / WIDTH), h: img.height * (322 / HEIGHT)}
    ctx.fillTextCenter(text, textRect, fontSize * 1.5);
}

function drawLeft(ctx, text, img, fontFamily) {
    let fontSize = img.height / 20;
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.fillStyle = 'black';

    let textRect = { x: img.width * (60 / WIDTH), y: img.height * (304 / HEIGHT), w: img.width * (246 / WIDTH), h: img.height * (325 / HEIGHT)}
    ctx.fillTextCenter(`It's\n${text}`, textRect, fontSize * 1.5);
}

function showResult(dataURL) {
    let element = document.getElementById('meme-result');
    element.src = dataURL;
    element.style.display = 'block';
}

// Lib
function mlFillText(text, x, y, w, h, hAlign, vAlign, lineheight) {
    text = text.replace(/[\n]/g, " \n ");
    text = text.replace(/\r/g, "");
    var words = text.split(/[ ]+/);
    var sp = this.measureText(' ').width;
    var lines = [];
    var actualline = 0;
    var actualsize = 0;
    var wo;
    lines[actualline] = {};
    lines[actualline].Words = [];
    i = 0;
    while (i < words.length) {
        var word = words[i];
        if (word == "\n") {
            lines[actualline].EndParagraph = true;
            actualline++;
            actualsize = 0;
            lines[actualline] = {};
            lines[actualline].Words = [];
            i++;
        } else {
            wo = {};
            wo.l = this.measureText(word).width;
            if (actualsize === 0) {
                while (wo.l > w) {
                    word = word.slice(0, word.length - 1);
                    wo.l = this.measureText(word).width;
                }
                if (word === "") return; // I can't fill a single character
                wo.word = word;
                lines[actualline].Words.push(wo);
                actualsize = wo.l;
                if (word != words[i]) {
                    words[i] = words[i].slice(word.length, words[i].length);
                } else {
                    i++;
                }
            } else {
                if (actualsize + sp + wo.l > w) {
                    lines[actualline].EndParagraph = false;
                    actualline++;
                    actualsize = 0;
                    lines[actualline] = {};
                    lines[actualline].Words = [];
                } else {
                    wo.word = word;
                    lines[actualline].Words.push(wo);
                    actualsize += sp + wo.l;
                    i++;
                }
            }
        }
    }
    if (actualsize === 0) lines[actualline].pop();
    lines[actualline].EndParagraph = true;

    var totalH = lineheight * lines.length;
    while (totalH > h) {
        lines.pop();
        totalH = lineheight * lines.length;
    }

    var yy;
    if (vAlign == "bottom") {
        yy = y + h - totalH + lineheight;
    } else if (vAlign == "center") {
        yy = y + h / 2 - totalH / 2 + lineheight;
    } else {
        yy = y + lineheight;
    }

    var oldTextAlign = this.textAlign;
    this.textAlign = "left";

    for (var li in lines) {
        var totallen = 0;
        var xx, usp;
        for (wo in lines[li].Words) totallen += lines[li].Words[wo].l;
        if (hAlign == "center") {
            usp = sp;
            xx = x + w / 2 - (totallen + sp * (lines[li].Words.length - 1)) / 2;
        } else if ((hAlign == "justify") && (!lines[li].EndParagraph)) {
            xx = x;
            usp = (w - totallen) / (lines[li].Words.length - 1);
        } else if (hAlign == "right") {
            xx = x + w - (totallen + sp * (lines[li].Words.length - 1));
            usp = sp;
        } else { // left
            xx = x;
            usp = sp;
        }
        for (wo in lines[li].Words) {
            this.fillText(lines[li].Words[wo].word, xx, yy);
            xx += lines[li].Words[wo].l + usp;
        }
        yy += lineheight;
    }
    this.textAlign = oldTextAlign;
}

(function mlInit() {
    CanvasRenderingContext2D.prototype.mlFillText = mlFillText;

    CanvasRenderingContext2D.prototype.fillTextCenter = function (text, rect, lineheight) {
        return this.mlFillText(text, rect.x, rect.y, rect.w, rect.h, "center", "center", lineheight);
    };
})();