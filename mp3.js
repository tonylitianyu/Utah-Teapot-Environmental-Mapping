
/**
 * @file A WebGL software for viewing meshes read from OBJ files
 * @author Anthony Li <tianyul2@illinois.edu>
 */

/** @global The WebGL context */
var gl;

/** @global The HTML5 canvas we draw on */
var canvas;

/** @global A simple GLSL shader program */
var shaderProgram;

/** @global A simple GLSL shader program for skybox */
var skyboxProgram;

/** @global The Modelview matrix */
var mvMatrix = mat4.create();

/** @global The View matrix */
var vMatrix = mat4.create();

/** @global The Projection matrix */
var pMatrix = mat4.create();

/** @global The Normal matrix */
var nMatrix = mat3.create();

/** @global The matrix stack for hierarchical modeling */
var mvMatrixStack = [];

/** @global An object holding the geometry for a 3D mesh */
var myMesh;

/** @global Vertex positions for cuben */
var vertexPositionBuffer;

/** @global Face index for cuben */
var IndexTriBuffer;

// View parameters
/** @global Location of the camera in world coordinates */
var eyePt = vec3.fromValues(0.0,0.0,11.0);
/** @global Direction of the view in world coordinates */
var viewDir = vec3.fromValues(0.0,0.0,-1.0);
/** @global Up vector for view matrix creation, in world coordinates */
var up = vec3.fromValues(0.0,1.0,0.0);
/** @global Location of a point along viewDir in world coordinates */
var viewPt = vec3.fromValues(0.0,0.0,0.0);

//Light parameters
/** @global Light position in VIEW coordinates */
var lightPosition = [20,20,20];
/** @global Ambient light color/intensity for Phong reflection */
var lAmbient = [0,0,0];
/** @global Diffuse light color/intensity for Phong reflection */
var lDiffuse = [1,1,1];
/** @global Specular light color/intensity for Phong reflection */
var lSpecular =[1,1,1];

//Material parameters
/** @global Ambient material color/intensity for Phong reflection */
var kAmbient = [0.1,0.0,0.0];
/** @global Diffuse material color/intensity for Phong reflection */
var kTerrainDiffuse = [205.0/255.0,163.0/255.0,63.0/255.0];
/** @global Specular material color/intensity for Phong reflection */
var kSpecular = [1.0,1.0,1.0];
/** @global Shininess exponent for Phong reflection */
var shininess = 230;
/** @global Edge color fpr wireframeish rendering */
var kEdgeBlack = [0.0,0.0,0.0];
/** @global Edge color for wireframe rendering */
var kEdgeWhite = [1.0,1.0,1.0];

/** @global finish loading texture */
var textureLoaded = false;
/** @global choosing the tyep of texture: 0-Reflection 1-Refraction 2-Phone Shading */
var textureMode = 0;


/** @global teapot rotation */
var eulerY=0;



//-------------------------------------------------------------------------
/**
 * Asynchronously read a server-side text file
 */
function asyncGetFile(url) {
  //Your code here
    console.log("Getting text file");
    return new Promise((resolve,reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url);
      xhr.onload = () => resolve(xhr.responseText);
      xhr.onerror= () => reject(xhr.statusText);
      xhr.send();
      console.log("Made promise");
    });

}

//-------------------------------------------------------------------------
/**
 * Sends parameters and modelview matrices to shader
 */
function uploadParameterToShader() {
  gl.uniformMatrix4fv(shaderProgram.mvMatrixUniform, false, mvMatrix);
  gl.uniformMatrix4fv(shaderProgram.vMatrixUniform, false, vMatrix);
  gl.uniform3fv(shaderProgram.uniformEyePosition, eyePt);
  gl.uniform1i(shaderProgram.uniformTextureMode, textureMode);
}

//-------------------------------------------------------------------------
/**
 * Sends projection matrix to shader
 */
function uploadProjectionMatrixToShader() {
  gl.uniformMatrix4fv(shaderProgram.pMatrixUniform,
                      false, pMatrix);
}

//-------------------------------------------------------------------------
/**
 * Generates and sends the normal matrix to the shader
 */
function uploadNormalMatrixToShader() {
  mat3.fromMat4(nMatrix,mvMatrix);
  mat3.transpose(nMatrix,nMatrix);
  mat3.invert(nMatrix,nMatrix);
  gl.uniformMatrix3fv(shaderProgram.nMatrixUniform, false, nMatrix);
}

//----------------------------------------------------------------------------------
/**
 * Pushes matrix onto modelview matrix stack
 */
function mvPushMatrix() {
    var copy = mat4.clone(mvMatrix);
    mvMatrixStack.push(copy);
}


//----------------------------------------------------------------------------------
/**
 * Pops matrix off of modelview matrix stack
 */
function mvPopMatrix() {
    if (mvMatrixStack.length == 0) {
      throw "Invalid popMatrix!";
    }
    mvMatrix = mvMatrixStack.pop();
}

//----------------------------------------------------------------------------------
/**
 * Sends projection/modelview matrices to shader
 */
function setMatrixUniforms() {
    gl.useProgram(shaderProgram);
    uploadParameterToShader();
    uploadNormalMatrixToShader();
    uploadProjectionMatrixToShader();
}

//----------------------------------------------------------------------------------
/**
 * Sends projection/modelview matrices to skybox shader
 */


function setSkyboxMatrixUniforms() {
    gl.useProgram(skyboxProgram);
    gl.uniformMatrix4fv(skyboxProgram.mvMatrixUniform, false, mvMatrix);
    gl.uniformMatrix4fv(skyboxProgram.pMatrixUniform, false, pMatrix);
    gl.uniformMatrix4fv(skyboxProgram.vMatrixUniform, false, vMatrix);
    
}

//----------------------------------------------------------------------------------
/**
 * Translates degrees to radians
 * @param {Number} degrees Degree input to function
 * @return {Number} The radians that correspond to the degree input
 */
function degToRad(degrees) {
        return degrees * Math.PI / 180;
}

//----------------------------------------------------------------------------------
/**
 * Creates a context for WebGL
 * @param {element} canvas WebGL canvas
 * @return {Object} WebGL context
 */
function createGLContext(canvas) {
  var names = ["webgl", "experimental-webgl"];
  var context = null;
  for (var i=0; i < names.length; i++) {
    try {
      context = canvas.getContext(names[i]);
    } catch(e) {}
    if (context) {
      break;
    }
  }
  if (context) {
    context.viewportWidth = canvas.width;
    context.viewportHeight = canvas.height;
  } else {
    alert("Failed to create WebGL context!");
  }
  return context;
}

//----------------------------------------------------------------------------------
/**
 * Loads Shaders
 * @param {string} id ID string for shader to load. Either vertex shader/fragment shader
 */
function loadShaderFromDOM(id) {
  var shaderScript = document.getElementById(id);

  // If we don't find an element with the specified id
  // we do an early exit
  if (!shaderScript) {
    return null;
  }

  // Loop through the children for the found DOM element and
  // build up the shader source code as a string
  var shaderSource = "";
  var currentChild = shaderScript.firstChild;
  while (currentChild) {
    if (currentChild.nodeType == 3) { // 3 corresponds to TEXT_NODE
      shaderSource += currentChild.textContent;
    }
    currentChild = currentChild.nextSibling;
  }

  var shader;
  if (shaderScript.type == "x-shader/x-fragment") {
    shader = gl.createShader(gl.FRAGMENT_SHADER);
  } else if (shaderScript.type == "x-shader/x-vertex") {
    shader = gl.createShader(gl.VERTEX_SHADER);
  } else {
    return null;
  }

  gl.shaderSource(shader, shaderSource);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

//----------------------------------------------------------------------------------
/**
 * Setup the fragment and vertex shaders
 */
function setupShaders() {
  var vertexShader = loadShaderFromDOM("shader-vs");
  var fragmentShader = loadShaderFromDOM("shader-fs");
  
  shaderProgram = gl.createProgram();
  
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert("Failed to setup shaders");
    console.log(gl.getShaderInfoLog(shaderProgram));
  }

  gl.useProgram(shaderProgram);

  shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition");
  gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);

  shaderProgram.vertexNormalAttribute = gl.getAttribLocation(shaderProgram, "aVertexNormal");
  gl.enableVertexAttribArray(shaderProgram.vertexNormalAttribute);

  shaderProgram.mvMatrixUniform = gl.getUniformLocation(shaderProgram, "uMVMatrix");
  shaderProgram.pMatrixUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");
  shaderProgram.nMatrixUniform = gl.getUniformLocation(shaderProgram, "uNMatrix");
    shaderProgram.vMatrixUniform = gl.getUniformLocation(shaderProgram, "uVMatrix");
    
  shaderProgram.uniformLightPositionLoc = gl.getUniformLocation(shaderProgram, "uLightPosition");
  shaderProgram.uniformAmbientLightColorLoc = gl.getUniformLocation(shaderProgram, "uAmbientLightColor");
  shaderProgram.uniformDiffuseLightColorLoc = gl.getUniformLocation(shaderProgram, "uDiffuseLightColor");
  shaderProgram.uniformSpecularLightColorLoc = gl.getUniformLocation(shaderProgram, "uSpecularLightColor");
  shaderProgram.uniformShininessLoc = gl.getUniformLocation(shaderProgram, "uShininess");
  shaderProgram.uniformAmbientMaterialColorLoc = gl.getUniformLocation(shaderProgram, "uKAmbient");
  shaderProgram.uniformDiffuseMaterialColorLoc = gl.getUniformLocation(shaderProgram, "uKDiffuse");
  shaderProgram.uniformSpecularMaterialColorLoc = gl.getUniformLocation(shaderProgram, "uKSpecular");
  shaderProgram.uniformEyePosition = gl.getUniformLocation(shaderProgram, "uEyePos");
  shaderProgram.uniformTextureMode = gl.getUniformLocation(shaderProgram, "textureMode");

}


//----------------------------------------------------------------------------------
/**
 * Setup the fragment and vertex shaders for skybox
 */
function setupSkyboxShaders(){
  var vertexShader = loadShaderFromDOM("skybox-vs");
  var fragmentShader = loadShaderFromDOM("skybox-fs");
  
  skyboxProgram = gl.createProgram();

  gl.attachShader(skyboxProgram, vertexShader);
  gl.attachShader(skyboxProgram, fragmentShader);
  gl.linkProgram(skyboxProgram);

  if (!gl.getProgramParameter(skyboxProgram, gl.LINK_STATUS)) {
    alert("Failed to setup skybox shaders");

  }

  gl.useProgram(skyboxProgram);
  skyboxProgram.vertexPositionAttribute = gl.getAttribLocation(skyboxProgram, "aVertexPosition");
  gl.enableVertexAttribArray(skyboxProgram.vertexPositionAttribute);
    
  skyboxProgram.vertexColorAttribute = gl.getAttribLocation(skyboxProgram, "aVertexColor");
  gl.enableVertexAttribArray(skyboxProgram.vertexColorAttribute);
    
  skyboxProgram.mvMatrixUniform = gl.getUniformLocation(skyboxProgram, "uMVMatrix");
  skyboxProgram.pMatrixUniform = gl.getUniformLocation(skyboxProgram,'uPMatrix');
    skyboxProgram.vMatrixUniform = gl.getUniformLocation(skyboxProgram, "uVMatrix");

}


//-------------------------------------------------------------------------
/**
 * Sends material information to the shader
 * @param {Float32} alpha shininess coefficient
 * @param {Float32Array} a Ambient material color
 * @param {Float32Array} d Diffuse material color
 * @param {Float32Array} s Specular material color
 */
function setMaterialUniforms(alpha,a,d,s) {
  gl.uniform1f(shaderProgram.uniformShininessLoc, alpha);
  gl.uniform3fv(shaderProgram.uniformAmbientMaterialColorLoc, a);
  gl.uniform3fv(shaderProgram.uniformDiffuseMaterialColorLoc, d);
  gl.uniform3fv(shaderProgram.uniformSpecularMaterialColorLoc, s);
}

//-------------------------------------------------------------------------
/**
 * Sends light information to the shader
 * @param {Float32Array} loc Location of light source
 * @param {Float32Array} a Ambient light strength
 * @param {Float32Array} d Diffuse light strength
 * @param {Float32Array} s Specular light strength
 */
function setLightUniforms(loc,a,d,s) {
  gl.uniform3fv(shaderProgram.uniformLightPositionLoc, loc);
  gl.uniform3fv(shaderProgram.uniformAmbientLightColorLoc, a);
  gl.uniform3fv(shaderProgram.uniformDiffuseLightColorLoc, d);
  gl.uniform3fv(shaderProgram.uniformSpecularLightColorLoc, s);
}





//----------------------------------------------------------------------------------
/**
 * Populate buffers with data
 */
function setupMesh(filename) {
   //Your code here
   myMesh = new TriMesh();
   myPromise = asyncGetFile(filename);
   //myMesh.loadCubeBuffer();
   myPromise.then((retrievedText) => {
     myMesh.loadFromOBJ(retrievedText);
     console.log("Yay! got the file");

   })
   .catch(
     (reason) => {
       console.log('Handle rejected promise ('+reason+') here.');
     });
}



/** @global vertex buffer */
var SkyboxVertexPositionBuffer;

/** @global teapot face buffer */
var SkyboxIndexTriBuffer;

/** @global teapot color buffer */
var SkyboxColorBuffer;

//----------------------------------------------------------------------------------
/**
 * Populate buffers with skybox data
 */
function setupSkyboxMesh(){
    var vBuffer = [1.0,1.0,1.0,//front
                        -1.0,1.0,1.0,
                        -1.0,-1.0,1.0,
                        -1.0,-1.0,1.0,
                        1.0,-1.0,1.0,
                        1.0,1.0,1.0,
                        1.0,1.0,1.0,//right
                        1.0,1.0,-1.0,
                        1.0,-1.0,1.0,
                        1.0,-1.0,1.0,
                        1.0,-1.0,-1.0,
                        1.0,1.0,-1.0,
                        -1.0,1.0,1.0,//left
                        -1.0,-1.0,-1.0,
                        -1.0,-1.0,1.0,
                        -1.0,1.0,1.0,
                        -1.0,1.0,-1.0,
                        -1.0,-1.0,-1.0,
                        1.0,1.0,-1.0,//back
                        -1.0,1.0,-1.0,
                        -1.0,-1.0,-1.0,
                        -1.0,-1.0,-1.0,
                        1.0,-1.0,-1.0,
                        1.0,1.0,-1.0,
                        1.0,1.0,1.0,//top
                        1.0,1.0,-1.0,
                        -1.0,1.0,1.0,
                        -1.0,1.0,1.0,
                        -1.0,1.0,-1.0,
                        1.0,1.0,-1.0,
                        1.0,-1.0,1.0,//bottom
                        1.0,-1.0,-1.0,
                        -1.0,-1.0,-1.0,
                        -1.0,-1.0,-1.0,
                        -1.0,-1.0,1.0,
                        1.0,-1.0,1.0];
    
    for (var j = 0; j < vBuffer.length; j++){
        vBuffer[j] = 35*vBuffer[j];
    }
    
    
    var fBuffer = [];
    for (var i = 0; i < (vBuffer.length/3); i++){
        fBuffer.push(i)
    }

    var cBuffer = [];
    for (var i = 0; i < (vBuffer.length/3); i++){
        cBuffer.push(0.5);
        cBuffer.push(0.5);
        cBuffer.push(0.5);
        cBuffer.push(1.0);
    }

    let numFaces = fBuffer.length/3;
    let numVertices = vBuffer.length/3;


    //----------------
    console.log("TriMesh: Loaded ", numFaces, " triangles.");
    console.log("TriMesh: Loaded ", numVertices, " vertices.");
    console.log("TriMesh: Loaded ", cBuffer.length/4, " color.");
    
    SkyboxVertexPositionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, SkyboxVertexPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vBuffer), gl.STATIC_DRAW);
    SkyboxVertexPositionBuffer.itemSize = 3;
    SkyboxVertexPositionBuffer.numItems = numVertices;
    console.log("Loaded ", SkyboxVertexPositionBuffer.numItems, " vertices");
    
    SkyboxColorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,SkyboxColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(cBuffer),gl.STATIC_DRAW);
    SkyboxColorBuffer.itemSize = 4;
    SkyboxColorBuffer.numItems = cBuffer.length/4;
    
    SkyboxIndexTriBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, SkyboxIndexTriBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(fBuffer),
          gl.STATIC_DRAW);
    SkyboxIndexTriBuffer.itemSize = 1;
    SkyboxIndexTriBuffer.numItems = fBuffer.length;
    console.log("Loaded ", SkyboxIndexTriBuffer.numItems/3, " triangles");
    

}

//----------------------------------------------------------------------------------
/**
 * Draw call for skybox
 */
function drawSkybox(){
    gl.bindBuffer(gl.ARRAY_BUFFER, SkyboxVertexPositionBuffer);
    gl.vertexAttribPointer(skyboxProgram.vertexPositionAttribute, SkyboxVertexPositionBuffer.itemSize,
                 gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, SkyboxColorBuffer);
    gl.vertexAttribPointer(skyboxProgram.vertexColorAttribute, SkyboxColorBuffer.itemSize,
                 gl.FLOAT, false, 0, 0);
    
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, SkyboxIndexTriBuffer);
    
    gl.drawElements(gl.TRIANGLES, SkyboxIndexTriBuffer.numItems, gl.UNSIGNED_INT,0);
}

//----------------------------------------------------------------------------------
/**
 * Set texture for skybox
 */
function setupSkyboxTexture(){

    
    const sources = [{target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X, dir: 'London/neg-x.png'},
                    {target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, dir: 'London/neg-y.png'},
                    {target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, dir: 'London/neg-z.png'},
                    {target: gl.TEXTURE_CUBE_MAP_POSITIVE_X, dir:  'London/pos-x.png'},
                    {target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y, dir:  'London/pos-y.png'},
                    {target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z, dir:  'London/pos-z.png'}];
    
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP,texture);
    sources.forEach((source) =>{
        const {target, dir} = source;
        gl.texImage2D(target, 0, gl.RGBA, 512,512,0,gl.RGBA, gl.UNSIGNED_BYTE, null);
        const img = new Image();
        img.src = dir;

        img.addEventListener('load',function(){
            gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
            gl.texImage2D(target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
        });
    });
    

    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    textureLoaded = true;
}


//----------------------------------------------------------------------------------
/**
 * Draw call that applies matrix transformations to model and draws model in frame
 */
function draw() {
    //console.log("function draw()")

    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // We'll use perspective
    mat4.perspective(pMatrix,degToRad(45),
                     gl.viewportWidth / gl.viewportHeight,
                     0.1, 500.0);

    // We want to look down -z, so create a lookat point in that direction
    //vec3.add(viewPt, eyePt, viewDir);

    // Then generate the lookat matrix and initialize the view matrix to that view
    mat4.lookAt(vMatrix,eyePt,viewPt,up);

    

    //Draw Mesh
    //ADD an if statement to prevent early drawing of myMesh
        mvPushMatrix();
        mat4.rotateY(mvMatrix, mvMatrix, degToRad(eulerY));
        //mat4.multiply(mvMatrix,vMatrix,mvMatrix);
        setMatrixUniforms();
        
        setLightUniforms(lightPosition,lAmbient,lDiffuse,lSpecular);
    
    
    
    
    
        //select texture mode
        if (document.getElementById("reflection").checked){
            console.log('reflect');
            textureMode = 0;
        }
    
        
        if (document.getElementById("refraction").checked){
            textureMode = 1;
        }
    
    
        if (document.getElementById("shading").checked){
            textureMode = 2;
        }

        
        //select display mode
        if ((document.getElementById("polygon").checked) || (document.getElementById("wirepoly").checked))
        {
            
            setMaterialUniforms(shininess,kAmbient,
                                kTerrainDiffuse,kSpecular);

            myMesh.drawTriangles();


        }

        if(document.getElementById("wirepoly").checked)
        {
            setMaterialUniforms(shininess,kAmbient,
                                kEdgeBlack,kSpecular);
            myMesh.drawEdges();
        }

        if(document.getElementById("wireframe").checked)
        {
            setMaterialUniforms(shininess,kAmbient,
                                kEdgeWhite,kSpecular);
            myMesh.drawEdges();
        }
    
        setSkyboxMatrixUniforms();
        drawSkybox();
        
        mvPopMatrix();


}




//----------------------------------------------------------------------------------
//Code to handle user interaction for key down

/** @global current keys pressed */
var currentlyPressedKeys = {};

function handleKeyDown(event) {
        //console.log("Key down ", event.key, " code ", event.code);
        currentlyPressedKeys[event.key] = true;
        if (currentlyPressedKeys["a"]) {
            // key A
            eulerY-= 5;
            eulerY = eulerY%360;
        } else if (currentlyPressedKeys["d"]) {
            // key D
            eulerY+= 5;
            eulerY = eulerY%360;
        }
    
    
        if (currentlyPressedKeys["ArrowLeft"]){

            vec3.rotateY(eyePt, eyePt, viewPt, -degToRad(1));
            
        } else if (currentlyPressedKeys["ArrowRight"]){

            vec3.rotateY(eyePt, eyePt, viewPt, degToRad(1));
        }

        if (currentlyPressedKeys["ArrowUp"]){
            // Up cursor key
            event.preventDefault();
            eyePt[2]+= 0.01;
        } else if (currentlyPressedKeys["ArrowDown"]){
            event.preventDefault();
            // Down cursor key
            eyePt[2]-= 0.01;
        }
        

}

//----------------------------------------------------------------------------------
//Code to handle user interaction for key up
function handleKeyUp(event) {
        //console.log("Key up ", event.key, " code ", event.code);
        currentlyPressedKeys[event.key] = false;
}

//----------------------------------------------------------------------------------
/**
 * Startup function called from html code to start program.
 */
 function startup() {
  canvas = document.getElementById("myGLCanvas");
  gl = createGLContext(canvas);
  setupShaders();
  setupMesh("teapot_0.obj");
  setupSkyboxShaders();
  setupSkyboxMesh();
  setupSkyboxTexture();
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.enable(gl.DEPTH_TEST);
  document.onkeydown = handleKeyDown;
  document.onkeyup = handleKeyUp;
  
  tick();
}


//----------------------------------------------------------------------------------
/**
  * Update any model transformations
  */
function animate() {
   //console.log(eulerX, " ", eulerY, " ", eulerZ);
   document.getElementById("eY").value=eulerY;
   document.getElementById("eZ").value=eyePt[2];
}


//----------------------------------------------------------------------------------
/**
 * Keeping drawing frames....
 */
function tick() {
    requestAnimFrame(tick);
    animate();
    if (textureLoaded == true && myMesh.loaded() == true){
        
        draw();
    }


    
}









