function test() {
  function calcFps() {
    if (!isPageHidden()) {
      if (!guiControls.paused) {
        if (guiControls.auto_IterPerFrame && !airplaneMode) {
          const fpsTarget = 60;
          const ratio = FPS / 60; if (ratio < 0.9) adjIterPerFrame((ratio - 1.0) * 10); else if (ratio < 1.0) adjIterPerFrame((ratio - 1.0) * 3); else if (FPS > 60) adjIterPerFrame(0.5);

          if (FPS == fpsTarget)
            adjIterPerFrame(1);
        }
      }
      /*
            for (let x = 0; x < sim_res_x; x++) {
              for (let y = 0; y < sim_res_y; y++) {
                let cellInd = (x + y * sim_res_x) * 4;
                let vapor = waterTextureValues[cellInd + 0];
                if (vapor < 1000.0) { // ignore wall
                  totalCloudWater += waterTextureValues[cellInd + 1];
                  totalWaterVapor += vapor;

                  totalSmoke += waterTextureValues[cellInd + 3];
                }
              }
            }

            let totalWater = totalWaterVapor + totalCloudWater;
            console.log('Water  Vapor  Cloud  Smoke\n', Math.round(totalWater), Math.round(totalWaterVapor), Math.round(totalCloudWater), Math.round(totalSmoke));
            */
    }
  }
}