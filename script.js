let grid;
let rows = 80;
let cols = 45;
let h = 10;
let w = 10;
let flag = true;
function make2DArray() {
    let temp = new Array(cols);
    for (let i= 0; i < cols; i++) {
        temp[i] = new Array(rows);
    }
    return temp;
}
function draw() {
    let canvas = document.getElementById('myCanvas');
    canvas.width = w*rows;
    canvas.height = h*cols;
    let ctx = canvas.getContext('2d');
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            ctx.fillStyle = grid[i][j] ? "white" : "#404040";
            ctx.strokeRect(j * w, i * h, w, h);
            ctx.fillRect(j * w, i * h, w, h);
        }
    }
}
function randomInitialize(){
    let ratio = 0.8;
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            grid[i][j] = Math.random() > ratio;
        }
    }
    draw();
}
function countNeighbor(i,j) {
    let n = 0;
    i += cols;
    j += rows;
    if (grid[(i-1)%cols][(j-1)%rows]) n++;
    if (grid[(i-1)%cols][j%rows]) n++;
    if (grid[(i-1)%cols][(j+1)%rows]) n++;
    if (grid[(i)%cols][(j-1)%rows]) n++;
    if (grid[(i)%cols][(j+1)%rows]) n++;
    if (grid[(i+1)%cols][(j-1)%rows]) n++;
    if (grid[(i+1)%cols][(j)%rows]) n++;
    if (grid[(i+1)%cols][(j+1)%rows]) n++;
    return n;
}
function next() {
    let temp = make2DArray();
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            temp[i][j] = grid[i][j];
            let n = countNeighbor(i,j);
            if (grid[i][j] && (n < 2 || n > 3)) temp[i][j] = false;
            if (!grid[i][j] && n == 3) temp[i][j] = true;
        }
    }
    grid = temp;
}
function clearState() {
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            grid[i][j] = false;
        }
    }
    draw();
}
function initialize() {
    grid = make2DArray();
    draw();
}
function start() {
    var x = document.getElementById('start');
    if (x.innerText == 'Start') {
        x.innerText = 'Stop';
        flag = true;
        generate();
    } else {
        x.innerText = 'Start';
        flag = false;
    }
}
function generate() {
    if (flag) {
        next();
        draw();
        setTimeout(generate, 100);
    }
}
function changeGrid(event) {
    let rect = document.getElementById('myCanvas').getBoundingClientRect();
    let x = event.clientX - rect.left;
    let y = event.clientY - rect.top;
    grid[Math.floor(y/h)][Math.floor(x/w)] = !grid[Math.floor(y/h)][Math.floor(x/w)];
    draw();
}