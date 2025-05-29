/*:
 * @plugindesc 钓鱼系统插件 v1.1
 * @author doubao
 *
 * @param 钓鱼按键
 * @desc 用于钓鱼操作的按键(默认: 空格)
 * @default space
 *
 * @param 鱼出现音效
 * @desc 鱼上钩时的音效文件名
 * @default Cursor1
 *
 * @param 成功音效
 * @desc 钓鱼成功时的音效文件名
 * @default Decision1
 *
 * @param 失败音效
 * @desc 钓鱼失败时的音效文件名
 * @default Cancel1
 *
 * @help
 * 钓鱼系统插件使用说明
 * ...（帮助内容保持不变）...
 */

(function() {
    'use strict';

    // 获取插件参数
    const parameters = PluginManager.parameters('FishingSystem');
    const fishingKey = parameters['钓鱼按键'] || 'space';
    const fishAppearSe = parameters['鱼出现音效'] || 'Cursor1';
    const successSe = parameters['成功音效'] || 'Decision1';
    const failSe = parameters['失败音效'] || 'Cancel1';

    // 鱼类配置数据
    const fishData = {
        1: { name: "小鱼", difficulty: 2, value: 10, description: "普通的小鱼，随处可见。" },
        2: { name: "鲈鱼", difficulty: 4, value: 30, description: "肉质鲜美的鲈鱼，比较少见。" },
        3: { name: "鲤鱼", difficulty: 6, value: 50, description: "体型较大的鲤鱼，力量很强。" },
        4: { name: "金鱼", difficulty: 8, value: 100, description: "色彩斑斓的金鱼，非常稀有。" },
        5: { name: "鲨鱼", difficulty: 12, value: 200, description: "巨大而凶猛的鲨鱼，极其罕见。" }
    };

    // 扩展事件解释器
    Game_Interpreter.prototype.eventId = function() {
        return this._eventId;
    };

    // 注册插件命令
    const _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand.call(this, command, args);
        if (command === 'StartFishing') {
            const eventId = this.eventId();
            const event = $gameMap.event(eventId);
            event.setFishingPoint(true);
        }
    };

    // 扩展游戏事件类
    Game_Event.prototype.setFishingPoint = function(isFishingPoint) {
        this._isFishingPoint = isFishingPoint;
    };

    Game_Event.prototype.isFishingPoint = function() {
        return !!this._isFishingPoint;
    };

    // 扩展场景地图
    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        if (this.isFishingTriggered()) {
            this.startFishing();
        }
    };

    Scene_Map.prototype.isFishingTriggered = function() {
        if (!Input.isTriggered('ok')) return false;

        const frontX = $gamePlayer.positionX;
        const frontY = $gamePlayer.positionY;
        return $gameMap.eventsXy(frontX, frontY).some(event => event.isFishingPoint());
    };

    Scene_Map.prototype.startFishing = function() {
        SceneManager.push(Scene_Fishing);
    };

    // 钓鱼场景
    class Scene_Fishing extends Scene_MenuBase {
        constructor() {
            super();
            this._fishingState = 'waiting';
            this._waitProgress = 0;
            this._fightProgress = 0;
            this._fishPosition = 50;
            this._fishSpeed = 1;
            this._fishId = this.selectRandomFish();
            this._fish = fishData[this._fishId];
        }

        selectRandomFish() {
            const rand = Math.random() * 100;
            if (rand < 60) return 1;
            if (rand < 85) return 2;
            if (rand < 95) return 3;
            if (rand < 99) return 4;
            return 5;
        }

        create() {
            super.create();
            this._fishingWindow = new Window_Fishing();
            this.addWindow(this._fishingWindow);
        }

        update() {
            super.update();
            switch (this._fishingState) {
                case 'waiting': this.updateWaiting(); break;
                case 'biting': this.updateBiting(); break;
                case 'fighting': this.updateFighting(); break;
                case 'success':
                case 'failed':
                    if (Input.isTriggered('ok')) this.returnToMap();
                    break;
            }
        }

        updateWaiting() {
            if ((this._waitProgress += 1) >= 100) {
                this._fishingState = 'biting';
                AudioManager.playSe({ name: fishAppearSe });
            }
            this._fishingWindow.refresh();
        }

        updateBiting() {
            if (Input.isTriggered(fishingKey)) {
                this._fishingState = 'fighting';
            } else if ((this._waitProgress -= 2) <= 0) {
                this._fishingState = 'failed';
                AudioManager.playSe({ name: failSe });
            }
            this._fishingWindow.refresh();
        }

        updateFighting() {
            // 鱼的移动逻辑
            this._fishPosition += this._fishSpeed * (Math.random() * 2 - 1) * this._fish.difficulty / 10;
            this._fishPosition = Math.max(0, Math.min(100, this._fishPosition));

            // 玩家输入处理
            this._fishSpeed *= Input.isPressed(fishingKey) ? 0.95 : 1.02;

            // 进度计算
            this._fightProgress += (this._fishPosition >= 40 && this._fishPosition <= 60) ? 0.5 : -0.2;
            this._fightProgress = Math.max(0, Math.min(100, this._fightProgress));

            // 结果判定
            if (this._fightProgress >= 100) {
                this._fishingState = 'success';
                this.giveFishReward();
                AudioManager.playSe({ name: successSe });
            } else if (this._fishSpeed > 5) {
                this._fishingState = 'failed';
                AudioManager.playSe({ name: failSe });
            }
            this._fishingWindow.refresh();
        }

        giveFishReward() {
            const item = $dataItems[this._fishId + 1000];
            if (item) $gameParty.gainItem(item, 1);
            $gameMessage.add(`成功钓到了 ${this._fish.name}!`);
        }

        returnToMap() {
            SceneManager.pop();
        }
    }

    // 钓鱼窗口
    class Window_Fishing extends Window_Base {
        constructor() {
            super(0, 0, Graphics.width, Graphics.height);
            this.opacity = 0;
            this.refresh();
        }

        refresh() {
            this.contents.clear();
            const scene = SceneManager._scene;
            const state = scene._fishingState;

            this.drawText("钓鱼中...", this.contents.width/2 - 100, 30, 200, 'center');

            switch(state) {
                case 'waiting':
                    this.drawStatusText("等待鱼咬钩...", scene._waitProgress / 100, 28);
                    break;
                case 'biting':
                    this.drawStatusText(`鱼咬钩了！快按${fishingKey}键！`, scene._waitProgress / 100, 10);
                    break;
                case 'fighting':
                    this.drawFightingUI(scene);
                    break;
                case 'success':
                    this.drawResultUI("成功！", scene._fish);
                    break;
                case 'failed':
                    this.drawResultUI("失败！鱼逃跑了...");
                    break;
            }
        }

        drawStatusText(text, rate, colorIndex) {
            this.drawText(text, this.contents.width/2 - 100, 100, 200, 'center');
            this.drawGauge(
                this.contents.width/4,
                150,
                this.contents.width/2,
                20,
                rate,
                this.gaugeBackColor(),
                this.textColor(colorIndex)
            );
        }

        drawFightingUI(scene) {
            // 绘制鱼信息
            this.drawText(`鱼：${scene._fish.name}`, this.contents.width/2 - 100, 60, 200, 'center');

            // 绘制控制区域
            const areaX = this.contents.width/4;
            const areaWidth = this.contents.width/2;
            this.contents.fillRect(areaX, 100, areaWidth, 50, this.gaugeBackColor());
            this.contents.fillRect(areaX + areaWidth*0.4, 100, areaWidth*0.2, 50, this.textColor(20));

            // 绘制鱼位置
            const fishX = areaX + (areaWidth * scene._fishPosition/100) - 10;
            this.contents.fillRect(fishX, 110, 20, 30, this.textColor(0));

            // 绘制进度条
            this.drawGauge(
                areaX,
                160,
                areaWidth,
                20,
                scene._fightProgress / 100,
                this.gaugeBackColor(),
                this.textColor(28)
            );

            this.drawText(`按住${fishingKey}键控制鱼的移动`, this.contents.width/2 - 150, 200, 300, 'center');
        }

        drawResultUI(title, fish) {
            this.drawText(title, this.contents.width/2 - 100, 100, 200, 'center');
            if (fish) {
                this.drawText(`钓到了: ${fish.name}`, this.contents.width/2 - 100, 150, 200, 'center');
                this.drawText(`价值: ${fish.value} 金币`, this.contents.width/2 - 100, 180, 200, 'center');
            }
            this.drawText("按确定键继续", this.contents.width/2 - 100, 250, 200, 'center');
        }
    }

    // 动态创建物品
    DataManager._fishingDatabaseLoaded = false;
    const _DataManager_isDatabaseLoaded = DataManager.isDatabaseLoaded;
    DataManager.isDatabaseLoaded = function() {
        if (!_DataManager_isDatabaseLoaded.call(this)) return false;
        if (!this._fishingDatabaseLoaded) {
            this.createFishingItems();
            this._fishingDatabaseLoaded = true;
        }
        return true;
    };

    DataManager.createFishingItems = function() {
        for (let id in fishData) {
            const itemId = parseInt(id) + 1000;
            if (!$dataItems[itemId]) {
                const fish = fishData[id];
                $dataItems[itemId] = {
                    id: itemId,
                    name: fish.name,
                    description: fish.description,
                    iconIndex: 120 + parseInt(id),
                    price: fish.value,
                    itypeId: 1,         // 物品类型s：消耗品
                    consumable: true,    // 可以被消耗
                    scope: 0,           // 使用范围：无
                    occasion: 0,         // 使用场合：总是
                    speed: 0,
                    successRate: 100,
                    repeats: 1,
                    tpGain: 0,
                    hitType: 0,
                    animationId: 0,
                    damage: {
                        type: 0,
                        elementId: 0,
                        formula: "0",
                        variance: 0,
                        critical: false
                    },
                    effects: [],
                    note: "<fishing_item>"
                };
            }
        }
    };
})();