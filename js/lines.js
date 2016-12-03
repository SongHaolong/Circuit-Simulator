"use strict";

import { $ } from "./jquery";
import { Point } from "./point";
import { SVG_NS } from "./init";
import { schMap } from "./maphash";
import { partsAll, partsNow } from "./collection";

//常量
const actionArea = $("#area-of-parts"),
    rotate = [
        [[1, 0], [0, 1]],   //同相
        [[0, 1], [-1, 0]],  //顺时针
        [[0, -1], [1, 0]],  //逆时针
        [[-1, 0], [0, -1]]  //反相
    ];

//解析对象，创建DOM
function creatDOM(obj) {
    const dom = $(obj.tag, SVG_NS, obj.attribute);
    if (obj.child) {
        for(let i = 0; i < obj.child.length; i++) {
            dom.append(creatDOM(obj.child[i]));
        }
    }
    return(dom);
}
//导线rect方块属性
function lineRectAttr(a1, a2) {
    const lefttop = [],
        rightlow = [],
        wide = 14,      //默认宽度 14
        temp = { "class": "line-rect" };

    lefttop[0] = Math.min(a1[0], a2[0]);
    lefttop[1] = Math.min(a1[1], a2[1]);
    rightlow[0] = Math.max(a1[0], a2[0]);
    rightlow[1] = Math.max(a1[1], a2[1]);
    if (lefttop[0] === rightlow[0]) {
        temp.x = lefttop[0] - wide / 2;
        temp.y = lefttop[1] - wide / 2;
        temp.height = rightlow[1] - lefttop[1] + wide;
        temp.width = wide;
    } else {
        temp.x = lefttop[0] - wide / 2;
        temp.y = lefttop[1] - wide / 2;
        temp.height = wide;
        temp.width = rightlow[0] - lefttop[0] + wide;
    }
    return (temp);
}

//新节点
function newNode(node, rotate) {
    const ans = {};
    ans.vector = [
        node.vector[0] * rotate[0][0] + node.vector[1] * rotate[1][0],
        node.vector[0] * rotate[0][1] + node.vector[1] * rotate[1][1]
    ];
    ans.point = [
        node.point[0] + ans.vector[0],
        node.point[1] + ans.vector[1]
    ];
    return(ans);
}
//搜索用的临时图纸模块
function SearchMap() {
    const self = {}, map = {};

    self.setValue = function(node, value) {
        if (!map[node[0]]) {
            map[node[0]] = [];
        }
        map[node[0]][node[1]] = value;
    };
    self.getValue = function(node) {
        if(!map[node[0]] || !map[node[0]][node[1]]) {
            return(false);
        }
        return (map[node[0]][node[1]]);
    };

    return(self);
}
//搜索用的规则集合模块
function SearchRules(nodestart, nodeend, mode) {
    const self = {};

    //变量保存在闭包中
    const start = nodestart.mul(0.05),
        end = Array.clone(nodeend, 0.05),
        small = "small";
    let excludeParts = "",  //需要排除的器件
        excludeLines = [],  //需要排除的导线
        endLine = [];       //终点等效的线段

    //点到点或线的最短距离
    function nodeDistance(node, end) {
        return Point.prototype.distance.call(node, end);
    }
    //node所在线段是否和当前节点方向垂直
    function nodeVerticalLine(node) {
        const status = schMap.getValueBySmalle(node.point);
        if (status && status.form === "line" || status.form === "cross-point") {
            for (let i = 0; i < status.connect.length; i++) {
                if ((Point([node.point, status.connect[i]])).isParallel(node.vector)) {
                    return (false);
                }
            }
        }
        return (true);
    }
    //返回node所在器件
    function excludePart(node) {
        const status = schMap.getValueBySmalle(node);
        if (status.form === "part") {
            return status.id;
        } else if (status.form === "part-point") {
            return status.id.split("-")[0];
        } else {
            return "";
        }
    }
    //返回node所在的线段
    function excludeLine(node) {
        const status = schMap.getValueBySmalle(node);
        if (status &&
            status.form === "line" ||
            status.form === "cross-point") {
            const ans = [];
            for (let i = 0; i < 2; i++) {
                const temp = [[1, 0], [-1, 0], [0, -1], [0, 1]],
                    limit = [
                        schMap.alongTheLineBySmall(node, false, temp[i * 2]),
                        schMap.alongTheLineBySmall(node, false, temp[i * 2 + 1]),
                    ];
                if (!limit[0].isEqual(limit[1])) {
                    ans.push(limit);
                }
            }
            return (ans);
        } else {
            return [];
        }
    }

    //价值估算
    //node到终点（线）距离 + 拐弯数量
    function calValue01(node) {
        return (
            nodeDistance(node.point, end) +
            node.junction
        );
    }
    //node到终线的距离 + 拐弯数量
    function calValue02(node) {
        let dis = 0;
        for (let i = 0; i < end.length - 1; i++) {
            dis += nodeDistance(node.point, end.slice(i, i + 2));
        }
        return (dis + node.junction);
    }
    //node到终点（线）的距离*3 + 拐弯的数量*3 + node到起点的距离
    function calValue03(node) {
        return (
            nodeDistance(node.point, end) * 3 +
            node.junction * 3 +
            nodeDistance(node.point, start)
        );
    }

    //搜索结束规则
    //node是否在某线段内
    function nodeInLine(node, line) {
        return Point.prototype.inLine.call(node, line);
    }
    //是否在lines线段集合中
    function checkEndEqLine(node, lines) {
        for (let i = 0; i < lines.length; i++) {
            if (nodeInLine(node, lines[i])) {
                return (lines[i]);
            }
        }
        return (false);
    }
    //等于终点
    function checkEndNode(node) {
        return node.point.isEqual(end);
    }
    //在终线范围内
    function checkEndLine(node) {
        for (let i = 0; i < end.length - 1; i++) {
            if (nodeInLine(node.point, end.slice(i, i + 2))) {
                return (true);
            }
        }
        return (false);
    }
    //点对点（在导线中）搜索的结束判断
    function checkNode2NodeLine(node) {
        //是否等于终点
        if (node.point.isEqual(end)) {
            return (true);
        }
        //是否在终点等效线段中
        const exLine = checkEndEqLine(node.point, endLine);
        //不在等效终线中
        if (!exLine) {
            return false;
        }
        //当前路径是直线
        if (!node.junction) {
            return true;
        }
        //所在等效线段方向和当前节点的关系
        if ((Point(exLine)).isParallel(node.vector)) {
            //等效线段和当前节点方向平行
            return true;
        } else {
            //等效线段和当前节点方向垂直
            const junction = node.junctionParent.vector,
                node2End = Point([node.point, end]);
            return (node2End.isOppoDire(junction));
        }
    }

    //节点扩展规则
    //点到空
    function exRuleNode2Space(node) {
        const status = schMap.getValueBySmalle(node.point);
        if (!status) {
            //空节点
            return true;
        } else if (status.form === "part") {
            //器件节点
            return false;
        } else if (status.form === "part-point") {
            //当前节点在引脚时在终点周围距离为1的地方都可行
            return (nodeDistance(node.point, end) < 2);
        } else if (status.form === "line" || status.form === "cross-point") {
            //当前节点方向必须和所在导线方向垂直
            return (nodeVerticalLine(node));
        } else {
            return (true);
        }
    }
    //直接对齐
    function exRuleNodeAlign(node) {
        const status = schMap.getValueBySmalle(node.point);
        if (!status) {
            return true;
        } else if (status.form === "part") {
            return false;
        } else if (status.form === "part-point") {
            //直接对齐时，器件引脚只能等于终点
            return (node.point.isEqual(end));
        } else if (status.form === "line" || status.form === "cross-point") {
            return (nodeVerticalLine(node));
        } else {
            return (true);
        }
    }
    //排除器件
    function exRuleExclude(node) {
        const status = schMap.getValueBySmalle(node.point);
        if (!status) {
            return (true);
        } else if (status.form === "part") {
            return (status.id === excludeParts);
        } else if (status.form === "part-point") {
            return (
                status.id.split("-")[0] === excludeParts ||
                nodeDistance(node.point, end) < 2
            );
        } else if (status.form === "line" || status.form === "cross-point") {
            return (nodeVerticalLine(node));
        } else {
            return (true);
        }
    }
    //排除器件/导线，直接对齐
    function exRuleExcludeAlign(node) {
        const status = schMap.getValueBySmalle(node.point);
        if (!status) {
            return (true);
        } else if (status.form === "part") {
            return (status.id === excludeParts);
        } else if (status.form === "part-point") {
            return (
                status.id.split('-')[0] === excludeParts ||
                node.point.isEqual(end)
            );
        } else if (status.form === "line" || status.form === "cross-point") {
            return (
                checkEndEqLine(node.point, excludeLines) ||
                nodeVerticalLine(node)
            );
        } else {
            return (true);
        }
    }

    //根据输入的模式设定检查函数
    switch (mode.process) {
        case "draw": {
            //绘制情况下，end只可能是点，根据终点属性来分类
            const status = schMap.getValueBySmalle(end);

            switch (status.form) {
                case "line": {
                    //导线
                    endLine = excludeLine(end);
                    self.checkPoint = exRuleNodeAlign;
                    self.checkEnd = checkNode2NodeLine;
                    break;
                }
                case "cross-point": {
                    //交错节点
                    endLine = excludeLine(end);
                    if (status.connect.length < 4) {
                        self.checkPoint = exRuleNodeAlign;
                        self.checkEnd = checkNode2NodeLine;
                    } else {
                        //交错节点连接了4个导线时，此终点是不可能达到的，此时的规则还没考虑好，先暂定和3个导线时一样
                        self.checkPoint = exRuleNodeAlign;
                        self.checkEnd = checkNode2NodeLine;
                    }
                    break;
                }
                case "part-point":
                case "line-point": {
                    //器件引脚、导线临时节点
                    self.checkPoint = exRuleNodeAlign;
                    self.checkEnd = checkEndNode;
                    break;
                }
                case "part": {
                    //器件本体
                    excludeParts = excludePart(end);
                    self.checkPoint = exRuleNode2Space;
                    self.checkEnd = exRuleExclude;
                    break;
                }
                default: {
                    self.checkPoint = exRuleNode2Space;
                    self.checkEnd = checkEndNode;
                }
            }
            //绘制模式下，节点估值
            self.calValue = calValue01;
            break;
        }
        case "line2line":
        case "line2part": {
            //由器件引脚开始，忽略终点全部
            //其余情况和part2any相同
            if(mode.status === "part") {
                excludeParts = excludePart(end);
                excludeLines = excludeLine(end);
                self.calValue = calValue01;
                self.checkEnd = checkNode2NodeLine;
                self.checkPoint = exRuleExcludeAlign;
                break;
            }
        }
        case "part2any": {
            //活动器件 -> 静止器物，end会是点或者线
            excludeParts = excludePart(start);
            excludeLines = excludeLine(start);
            if (Point.isPoint(end)) {
                //end是点
                endLine = excludeLine(end);
                self.calValue = calValue01;
                self.checkEnd = checkNode2NodeLine;
                self.checkPoint = exRuleExcludeAlign;
            }
            else {
                //end是线
                self.calValue = calValue02;
                self.checkEnd = checkEndLine;
                self.checkPoint = exRuleExcludeAlign;
            }
            break;
        }
        case "modified": {
            //修饰导线
            self.checkPoint = exRuleNodeAlign;
            self.checkEnd = checkEndNode;
            self.calValue = calValue01;
            break;
        }
        default: {

        }
    }

    //当前点扩展点数
    self.expandNumber = function (node) {
        //如果当前扩展点在某导线上且该点不是排除点，那么只允许直行
        if (schMap.isLine(node)) {
            if (this.nodeInLine(node, excludeLines)) {
                return (3);
            } else {
                return (1);
            }
        } else {
            return (3);
        }
    };
    //起点是否符合终点
    if (self.checkEnd({point: start})) {
        return (new LineWay([nodestart]));
    }
    //返回模块
    return (self);
}
//搜索用的堆栈模块
function SearchStack(nodestart, vector, map) {
    const self = {}, start = nodestart.mul(0.05), stack = [];

    stack[0] = [];
    stack[0][0] = {
        point: start,
        vector: vector,
        junction: 0,
        value: 0,
        parent: false,
        straight: true
    };
    //起点的junctionParent属性的等于其自身
    stack[0][0].junctionParent = stack[0][0];
    map.setValue(start, stack[0][0]);

    self.openSize = 1;
    self.closeSize = 0;
    self.pop = function() {
        for (let i in stack) {
            if(stack.hasOwnProperty(i)) {
                const temp = stack[i].pop();
                if (!stack[i].length) {
                    delete stack[i];
                }
                self.openSize --;
                self.closeSize ++;
                return(temp);
            }
        }
    }
    self.push = function(node) {
        let expandFlag = true;
        const status = map.getValue(node.point);

        if (status) {
            //如果当前扩展的节点已经搜索过则需要对比，保留value较小的
            if(node.value > status.value) {
                expandFlag = false;
            } else if(stack[status.value]) {
                for(let j = 0; j < stack[status.value].length; j++) {
                    if (status === stack[status.value][j]) {
                        stack[status.value].splice(j, 1);
                        if (!stack[status.value].length) {
                            delete stack[status.value];
                        }
                        break;
                    }
                }
            }
        }
        if (expandFlag) {
            //按照估值大小，将新扩展的点插入open堆栈
            if (!stack[node.value]) {
                stack[node.value] = [];
            }
            stack[node.value].push(node);
            map.setValue(node.point, node);
            self.openSize ++;
        }
    }
    self.get = function(i, j) {
        if(!stack[i] || !stack[i][j]) {
            return (false);
        } else {
            return(stack[i][j]);
        }
    }

    return(self);
}
//A*路径搜索
function AStartSearch(start, end, vector, opt) {
    //初始化
    const map = SearchMap(),
        check = SearchRules(start, end, opt),
        stackopen = SearchStack(start, vector, map);

    //检查checkNode是否有结束标记
    if(check instanceof LineWay) {
        return(check);
    }

    //计算初始值的估值
    //stackopen.get(0, 0).value = check.calValue(stackopen.get(0, 0));

    //结束标记
    let endFlag = false, endStatus;
    //A*搜索，少于1000个节点
    while((!endFlag)&&(stackopen.closeSize < 1000)) {
        //open栈栈顶元素弹出作为当前节点
        const nodenow = stackopen.pop(),
            expandCount = check.expandNumber(nodenow.point);

        (typeof mapTest !== "undefined" && mapTest.point(nodenow.point, "#2196F3", 20));

        for (let i = 0; i < expandCount; i++) {
            const nodexpand = newNode(nodenow, rotate[i]);

            (typeof mapTest !== "undefined" && mapTest.point(nodexpand.point, "#000000", 20));

            //节点性质计算
            nodexpand.junction = nodenow.junction + ((!i || i === 3) ? 0 : 1);
            nodexpand.parent = nodenow;
            nodexpand.straight = true;
            nodexpand.junctionParent = i ? nodenow : nodenow.junctionParent;
            nodexpand.value = check.calValue(nodexpand);

            //当前扩展点是否是终点
            if (check.checkEnd(nodexpand)){
                endStatus = nodexpand;
                endFlag = true;
                break;
            }

            //当前扩展点是否满足扩展要求
            if (check.checkPoint(nodexpand)) {
                //节点加入搜索栈
                stackopen.push(nodexpand);
            } else {
                //直行时遇到障碍物
                nodenow.straight = (!i) ? false : nodenow.straight;
            }
        }
        if (!stackopen.openSize && !endFlag) {
            return (new LineWay([Point(start)]));
        }
    }

    (typeof mapTest !== "undefined" && mapTest.clear());

    const tempway = new LineWay();
    //起点的junctionParent等于其自身，所以这里检测节点的parent属性
    while(endStatus.parent){
        tempway.push(Point([endStatus.point[0]*20, endStatus.point[1]*20]));
        endStatus = endStatus.junctionParent;
    }
    tempway.push(Point(start));
    tempway.reverse();
    return(tempway);
}
//路径搜索函数
const Search = {
    //绘制导线
    draw: {
        start: function(event, part, mark) {
            /*
             * 包含三种情况：
             *   1. 从已有导线的器件引脚开始
             *   2. 从交错节点开始
             *   3. 从临时节点开始
             */

            const grid = this.current,
                mouse = grid.mouse(event),
                mouseRound = mouse.round();

            //当前点是导线起点，则导线需要反转
            if(mouseRound.isEqual(this.way[0])) {
                this.reverse();
            }
            //临时变量
            this.current.extend({
                startNode: Point(this.way[0]),
                mouseGrid: new WayMap(),
                enforceAlign: {},
                backup: {
                    node: Point(mouseRound),
                    way: new LineWay(this.way)
                }
            });

            this.toFocus();
            this.drawCircle(1);
            this.toGoing();
            this.deleteSign();

            //相关器件断开与当前导线的连接
            if(part && part.elementDOM) {
                //器件引脚
                part.setConnect(mark, false);
            } else if(part instanceof Array) {
                //交错节点
                for(let i = 0; i < part.length; i++) {
                    part[i].deleteConnect(this.id);
                }
            } else {
                //临时节点不需要记录旧路径
                this.current.oldStatus = null;
            }

            //计算当前导线的初始方向
            this.current.initTrend = this.initTrend(0);
        },
        callback: function(event) {
            //预处理
            const gridL = this.current.gridL,
                enforceAlign = this.current.enforceAlign,
                mouseBias = this.current.mouseBias(event),
                mousePosition = this.current.mouse(event),
                mouseRound = mousePosition.round(),
                mouseFloor = mousePosition.floor(),
                pointStatus = schMap.getValueByOrigin(mouseRound),
                option = {process: "draw"};

            let lastConnect = false;

            //鼠标当前状态
            if(pointStatus.form === "line-point" || pointStatus.form === "cross-point" && pointStatus.connect.length === 3) {
                option.preStatus = "point";
            } else if(pointStatus.form === "line" || pointStatus.form === "cross-point" && pointStatus.connect.length === 4) {
                option.preStatus = "line";
            } else if(enforceAlign.label && enforceAlign.onPart) {
                option.preStatus = "align";
            } else {
                option.preStatus = "space";
            }

            //当鼠标移动了一格或者强制更新标志位为高时更新搜索路径
            if(enforceAlign.flag || !mouseFloor.isEqual(gridL)) {
                //上次的连接点
                lastConnect = enforceAlign.label;
                //强制对齐标志复位
                enforceAlign.label = false;
                enforceAlign.flag = false;
                //准备方格数据
                const partObj = enforceAlign.part,
                    nodeStart = this.current.startNode,
                    initTrend = this.current.initTrend,
                    mouseGridL = this.current.mouseGrid || new WayMap(),
                    mouseGrid = this.current.mouseGrid = new WayMap();
                let endGrid = mouseFloor.toGrid();

                //在器件上，需要与器件引脚对齐
                if(enforceAlign.onPart) {
                    const mouseVector = mousePosition.add(mouseBias).add(-1, partObj.position),
                        pointVector = partObj.pointRotate()
                            .map((item, index) => (partObj.connect[index]) ? false : item.position),
                        pointEnd = mouseVector.similar(pointVector);
                    //允许直接对齐
                    if (pointEnd) {
                        const nodeEnd = partObj.position.add(pointEnd.value);
                        option.preStatus = "align";
                        endGrid = [nodeEnd];
                        enforceAlign.label = { part: partObj, sub: pointEnd.sub, node: nodeEnd };
                    }
                }

                //更新路径
                mouseGridL.forSameNode(endGrid, mouseGrid);
                for(let i = 0; i < endGrid.length; i++) {
                    const end = endGrid[i];
                    if(!mouseGrid.get(end)) {
                        mouseGrid.set(end,
                            AStartSearch(nodeStart, end, initTrend, option)
                                .checkWayExcess(initTrend)
                        );
                    }
                }

                //记录当前搜索框的定位点
                gridL[0] = Math.floor(mousePosition[0] / 20) * 20;
                gridL[1] = Math.floor(mousePosition[1] / 20) * 20;
            }

            //后处理
            const mouseGrid = this.current.mouseGrid;
            if(lastConnect) {
                lastConnect.part.shrinkPoint(lastConnect.sub);
            }
            switch(option.preStatus) {
                case "line": {
                    //鼠标在某导线上
                    //与鼠标四舍五入的点相连坐标集合与四方格坐标集合的交集
                    const roundSet = pointStatus.connect
                        .map((item) => [item[0] * 20, item[1] * 20])
                        .filter((item) => mouseGrid.has(item) &&
                            schMap.getValueByOrigin(item).form !== "part-point");

                    if(roundSet.length) {
                        //交集不为空
                        //交集中离鼠标最近的点
                        const closest = mousePosition.closest(roundSet).value,
                            mouseRoundWay = mouseGrid.get(mouseRound);
                        //导线最后两个节点不同
                        if(mouseRoundWay.isSimilar(mouseGrid.get(closest))) {
                            this.shrinkPoint(1);
                            this.way.clone(mouseRoundWay);
                            this.way.endToLine([mouseRound, closest], mousePosition);
                            break;
                        }
                    }
                }
                case "point": {
                    //与点对齐模式
                    this.shrinkPoint(1);
                    this.way.clone(mouseGrid.get(mouseRound));
                    break;
                }
                case "align": {
                    //直接对齐模式
                    this.shrinkPoint(1);
                    this.way.clone(mouseGrid.get(enforceAlign.label.node));
                    enforceAlign.label.part.enlargePoint(enforceAlign.label.sub);
                    break;
                }
                default: {
                    //鼠标当前为空
                    this.way.clone(mouseGrid.nodeMax());
                    this.way.endToMouse(mousePosition);
                    this.enlargePoint(1);
                }
            }
            this.wayDrawing();
        },
        end: function() {
            const start = this.way[0],
                initTrend = this.current.initTrend,
                mouse = this.way.get(-1),
                mouseRound = mouse.round(),
                status = schMap.getValueByOrigin(mouseRound);

            //以mouseRound为中心寻找可行的点，并重新搜索路径
            function newLineWay() {
                const end = Point(schMap.nodeRound(mouseRound, mouse,
                    schMap.getValueByOrigin.bind(schMap)
                ));
                return(
                    AStartSearch(start, end, initTrend, {process:"draw"})
                        .checkWayExcess(initTrend)
                );
            }

            //起点和终点相等或者只有一个点，则删除当前导线
            if (this.way.length < 2 || mouseRound.isEqual(this.way[0])) {
                this.deleteSelf();
                return (false);
            }

            //根据终点分类来确定导线的结局
            switch(status.form) {
                case "part-point": {
                    //器件引脚
                    const temp = status.id.split("-"),
                        clickpart = partsAll.findPart(temp[0]),
                        pointmark = parseInt(temp[1]);

                    if (!clickpart.connect[pointmark]) {
                        clickpart.shrinkPoint(pointmark);
                        clickpart.setConnect(pointmark, this.id);
                        clickpart.toFocus();
                        this.setConnect(1, clickpart.id + "-" + pointmark);
                    } else {
                        //此点已经被占用
                        this.way.clone(newLineWay());
                    }
                    break;
                }
                case "line-point": {
                    const clickpart = partsAll.findPart(status.id);
                    this.mergeLine(clickpart);
                    return (true);
                }
                case "line": {
                    const clickpart = partsAll.findPart(status.id);
                    this.splitLine(clickpart, 1);
                    break;
                }
                case "cross-point": {
                    const lines = schMap.getValueByOrigin(status).id.split(" ")
                        .map((n) => partsAll.findPart(n));

                    if (lines.length === 3) {
                        for (let i = 0; i < 3; i++) {
                            const sub = mouseRound.isEqual(lines[i].way[0]) ? 0 : 1;
                            lines[i].setConnect(sub, lines[i].connect[sub] + " " + this.id);
                        }
                        this.setConnect(1, status.id);
                    } else if (lines.length === 4) {
                        //连接了四个导线，此点不可用
                        this.way.clone(newLineWay());
                    }
                    break;
                }
                default: {
                    if (!this.connect[0]) {
                        this.deleteSelf();
                        return (false);
                    }
                    this.way.clone(newLineWay());
                }
            }

            this.render();
            this.markSign();
        }
    },
    //移动器件导致的导线变形
    movePart: {
        start: function() {
            //两个连接点的器件
            const con0 = partsAll.findPart(this.connect[0]),
                con1 = partsAll.findPart(this.connect[1]),
                cur = this.current;

            //活动器件 -> 静止导线/器件
            if(partsNow.has(con0) || partsNow.has(con1)) {
                //活动器件端为起点
                if(this.getConnectStatus(1) === "part") {
                    this.reverse();
                }
                cur.status = "part2any";
            }
            //活动导线 -> 静止导线
            else if(!con0 && !con1) {
                //端点1所连导线之中有在partNow栈中的
                //此时导线需要反向，默认活动导线端为起点
                if(this.connect[1].split(" ")
                    .some((n) => partsNow.has(n))) {
                    this.reverse();
                }

                cur.status = "line2line";
            }
            //活动导线 -> 静止器件
            else if(!con0 || !con1) {
                // con0存在，意味着端点0为静止器件
                // 此时导线需要反向，默认活动导线端为起点
                if(con0) { this.reverse(); }

                cur.status = "line2part";
                //静止器件出线方向做备用
                cur.backTrend = this.initTrend(1);
            }
            //临时属性
            cur.wayBackup = new LineWay(this.way);
            cur.initTrend = this.initTrend(0);
            cur.startPoint = Point(this.way[0]);
        },
        callback: function(point) {
            const cur = this.current,
                gridL = cur.gridL,
                wayBackup = cur.wayBackup,
                initTrend = cur.initTrend,
                mouseFloor = point.floor(),
                option = {process: cur.status};

            //更新路径
            if(!mouseFloor.isEqual(gridL)) {
                const gridPoints = mouseFloor.toGrid(),
                    end = wayBackup.gridToEnd(gridPoints),
                    searchGridL = cur.mouseGrid || new WayMap(),
                    searchGrid = cur.mouseGrid = new WayMap(),
                    mouseGrid = cur.mouseGrid = new WayMap();

                //更新路径
                searchGridL.forSameNode(gridPoints, searchGrid);
                for(let i = 0; i < gridPoints.length; i++) {
                    const start = gridPoints[i];
                    if(mouseGrid.get(start)) { continue; }

                    mouseGrid.set(start,
                        AStartSearch(start, end.seg, initTrend, option)
                            .checkWayExcess(initTrend)
                    );
                }

                //新旧路径合并
                searchGrid.forEach((node, way) => {
                    const temp = new LineWay(wayBackup);
                    temp.splice(0, end.sub, ...way);
                    temp.checkWayRepeat();

                    mouseGrid.set(node, temp);
                });
                //记录当前搜索框的定位点
                cur.gridL = mouseFloor;
            }

            //后处理
            const mouseGrid = this.current.mouseGrid;
            this.way.clone(mouseGrid.nodeMax());
            this.way.endToMouse(-1, point);
            this.wayDrawing();
        },
        end: function() {
            if (this.current.status !== "move") {
                //求新的起/终点
                const start = this.connectNode(0),
                    end = this.connectNode(1),
                    trend = this.current.initTrend;

                //重新搜索路径
                this.way.clone(
                    AStartSearch(start, end, trend, {process: "draw"})
                        .checkWayExcess(trend)
                );

                //终点重设定
                this.resetPoint(1);
            }
            this.render();
            this.markSign();
        }
    },
    deformation: {

    }
};

//导线路径类
function LineWay(way) {
    this.length = 0;
    if (way instanceof Array) {
        for (let i = 0; i < way.length; i++) {
            this.push(Point(way[i]));
        }
    }
}
LineWay.prototype = {
    constructor: LineWay,
    push(node) {
        this[this.length++] = Point(node);
        return(this.length);
    },
    unshift(...args) {
        const len = args.length;
        for(let i = this.length - 1; i >= 0; i--) {
            this[i + len] = this[i];
        }
        for(let i = 0; i < len; i++) {
            this[i] = Point(args[i]);
        }
        this.length = this.length + len;
        return(this.length);
    },
    //路径标准化
    standardize(bias) {
        for(let i = 0; i < this.length; i++) {
            this[i] = bias
                ? this[i].add(bias).round()
                : this[i].round();
        }
        return(this);
    },
    //去除节点冗余
    checkWayRepeat() {
        for (let i = 0; i < this.length - 2; i++) {
            if (((this[i][0] === this[i + 1][0]) && (this[i + 1][0] === this[i + 2][0])) ||
                ((this[i][1] === this[i + 1][1]) && (this[i + 1][1] === this[i + 2][1])) ||
                ((this[i][0] === this[i + 1][0]) && (this[i][1] == this[i + 1][1]))) {
                this.splice(i + 1, 1);
                i -= 2;
                if (i < -1) i = -1;
            }
        }
        return(this);
    },
    //去除路径冗余
    checkWayExcess(trend) {
        if (this.length <= 3) {
            return(this);
        }
        //如果优先出线方向和第二个线段方向相同，说明此处需要修正
        if (trend.isSameDire(Point([this[1], this[2]]))) {
            this.splice(0, 3, ...AStartSearch(this[0], this[2], trend, {process: "modified"}));
            this.checkWayRepeat();
        }

        for (let i = 0; i < this.length - 3; i++) {
            const vector = [
                (Point([this[i], this[i + 1]])).toUnit(),
                (Point([this[i + 2], this[i + 3]])).toUnit()
            ];
            let tempWay, tempVector;
            if (vector[0].isEqual(vector[1])) {
                //同向修饰
                tempWay = AStartSearch(this[i + 1], this[i + 3], vector[0], {process: "modified"});
                tempVector = Point([tempWay[0], tempWay[1]]);
                if(tempWay.length < 4 && tempVector.isSameDire(vector[0])) {
                    this.splice(i + 1, 3, ...tempWay);
                    this.checkWayRepeat();
                    i--;
                }
            } else if(this.length > 4){
                //导线必须大于4个节点才有必要进行反向修饰
                tempWay = AStartSearch(this[i], this[i + 3], vector[0], {process: "modified"});
                if(tempWay.length < 4) {
                    this.splice(i, 4, ...tempWay);
                    this.checkWayRepeat();
                    i--;
                }
            }
        }
        this.checkWayRepeat();
        return(this);
    },
    //复制路径，将会抛弃原路径数据的全部引用，也不会引用被复制的数据
    clone(tempway) {
        for (let i = 0; i < tempway.length; i++) {
            this[i] = Point(tempway[i]);
        }
        this.splice(tempway.length);
        this.length = tempway.length;
    },
    //tempWay和this是否完全相等
    isSame(tempway) {
        for(let i = 0; i < this.length; i++) {
            if(!(this[i].isEqual(tempway[i]))) {
                return(false);
            }
        }
        return(true);
    },
    //路径有且仅有最后两个节点不同，其余全部相同；完全相同仍然会输出false
    isSimilar(tempway) {
        if(this.length !== tempway.length) {
            return(false);
        }
        for(let i = 0; i < this.length - 2; i++) {
            if(!(this[i].isEqual(tempway[i]))) {
                return(false);
            }
        }
        return(
            (!this.get(-1).isEqual(tempway.get(-1))) &&
            (!this.get(-2).isEqual(tempway.get(-2)))
        );
    },
    //返回导线的所有节点
    nodeCollection() {
        const ans = [];

        for(let i = 0; i < this.length - 1; i++) {
            const vector = Point([this[i], this[i + 1]]).toUnit().mul(20);
            let node = Point(this[i]);
            while(Point([node, this[i + 1]]).isSameDire(vector)) {
                ans.push(node);
                node = node.add(vector);
            }
        }
        //最后一个点
        ans.push(Point(this.get(-1)));

        return(ans);
    },
    //导线终点扩展
    endExpand(points, endPoint, initTrend) {
        if (schMap.isLine(endPoint)) return([]);

        const ans = [];
        if(this.length > 1) {
            //当前路径终点方向
            const tempvector = Math.vectorInit(this[this.length - 2], this[this.length - 1], 20);
            const turn = (initTrend.isEqual(Math.vectorInit(this[0], this[1]))) ? (this.length - 2) : (this.length - 1);
            for(let i = 0; i < 4; i ++) {
                //原路径不是直线，不允许再次拐弯
                //下标1、2是指在最顶上面rotate中顺时针和逆时针旋转的矩阵，这里要跳过它们
                if (turn && (i === 1 || i === 2)) continue;
                //新的终点坐标
                const tempEnd = [
                    this[this.length - 1][0] + tempvector[0] * rotate[i][0][0] + tempvector[1] * rotate[i][1][0],
                    this[this.length - 1][1] + tempvector[0] * rotate[i][0][1] + tempvector[1] * rotate[i][1][1]
                ];
                if (schMap.isLine(tempEnd)) continue;
                //新终点在四方格之内
                if (points.some((n) => n.isEqual(tempEnd))) {
                    let newWay = new LineWay(this);
                    newWay.push(tempEnd);
                    newWay.checkWayRepeat();
                    ans.push([tempEnd, newWay]);
                }
            }
        }
        return(ans);
    },
    //导线起点扩展
    startExpand(points, startPoint, initTrend) {
        const tempWay = new LineWay(Array.clone(this).reverse()),
            trend = initTrend.mul(-1),
            ans = tempWay.endExpand(points, startPoint, trend);
        for(let i = 0; i < ans.length; i++) {
            ans[i][1].reverse();
        }
        return(ans);
    },
    //终点/起点指向指定坐标
    endToMouse(dir, node) {
        node = (arguments.length === 1) ? dir : node;
        dir = (arguments.length === 1) ? 1 : dir;

        const end = (dir === 1) ? this.length - 1 : 0,
            last = (dir === 1) ? this.length - 2 : 1;

        if (this.length > 1) {
            if (this[end][0] === this[last][0]) {
                this[last][0] = node[0];
            } else {
                this[last][1] = node[1];
            }
        }
        this[end] = node;
    },
    //终点指向指定线段
    endToLine(line, position) {
        if (line[0][0] === line[1][0]) {
            //竖着的
            this[this.length - 1][1] = position[1];
            this[this.length - 2][1] = position[1];
            this[this.length - 1][0] = line[0][0];
        } else {
            //横着的
            this[this.length - 1][1] = line[0][1];
            this[this.length - 1][0] = position[0];
            this[this.length - 2][0] = position[0];
        }
    },
    //由四方格回溯导线下标，从起点开始
    gridToEnd(grid) {
        const ans = [],
            farest = Point(this[0].farest(grid).value);

        //当前导线只有1个线段，返回终点
        if(this.length === 2) {
            return({
                sub: this.length,
                seg: Point(this.get(-1))
            });
        }

        //0为横线段，1为竖线段
        for(let sub = 0; sub < 2; sub++) {
            const segs = [],
                line = this.map((n) => [(1 - sub) * n[0], sub * n[1]]),
                points = grid.map((n) => [(1 - sub) * n[0], sub * n[1]]),
                last = this[0][1 - sub] === this[1][1 - sub]
                    ? Point([this[0], this[1]])
                    : Point([this[1], this[2]]),
                toGrid = Point([
                    line[0],
                    [(1 - sub) * farest[0], sub * farest[1]]
                ]);

            //最终线段的方向与当前方格方向相反
            if(last.isOppoDire(toGrid)) {
                ans[sub] = 0;
                continue;
            }
            //回溯导线
            for(let i = 0; i < line.length - 1; i++) {
                if(this[i][sub] === this[i + 1][sub]) {
                    continue;
                }
                if(points.every((n) => Point.prototype.inLine.call(n, [line[i], line[i + 1]]))) {
                    segs.push(i);
                }
            }
            //是否在导线范围内
            if(!segs.length) {
                ans[sub] = this.length + 1;
            } else {
                ans[sub] = farest.closest(segs.map((n) => [this[n], this[n + 1]])).sub;
            }
        }

        const diff = Math.abs(ans[0] - ans[1]),
            max = Math.maxOfArray(ans);
        if (max === 0) {
            return({
                sub: 1,
                seg: [this[1], this[2]]
            });
        } else if(max === this.length + 1){
            return({
                sub: this.length,
                seg: Point(this.get(-1))
            });
        } else if(diff === 1) {
            return({
                sub: max - 1,
                seg: [this[max - 1], this[max], this[max + 1]]
            });
        }
    },
    //同Array的map方法
    map(callback) {
        const way = new LineWay();

        for(let i = 0; i < this.length; i++) {
            way.push(callback(this[i], i));
        }

        return(way);
    }
    /*
    //求路径长度
    len() {
        let ans = 0;
        for(let i = 0; i < this.length - 1; i++) {
            ans += Math.abs(this[i][0] - this[i + 1][0]) + Math.abs(this[i][1] - this[i + 1][1]);
        }
        return(ans);
    },
    //由某点求距离这点最短的线段在当前导线的下标
    searchNodeSub(node) {
        if(this.length === 2) {
            return(1);
        }
        const ans = new Array(2);

        for(let k = 0; k < 2; k++) {
            for (let i = 0; i < this.length - 1; i++) {
                if (this[i][k] === this[i + 1][k]) {
                    const sub = 1 - k;
                    if (((this[i][sub] < node[sub]) && (this[i + 1][sub] > node[sub])) ||
                        ((this[i][sub] > node[sub]) && (this[i + 1][sub] < node[sub]))) {
                        ans[k] = i;
                    }
                }
            }
        }
        if(typeof ans[0] === "undefined" && typeof ans[1] === "undefined") {
            //节点在导线范围外那么输出[起点、终点]和当前点距离比较近的
            const wait = [this[0], this[this.length - 1]];
            if(nodeDistance(wait[0], node) < nodeDistance(wait[1], node)) {
                return(0);
            } else {
                return(this.length - 1);
            }
        }

        return(Math.maxOfArray(ans));
    },
    //点在导线的哪个线段上，返回该线段起点在导线中的下标
    nodeInWay(node) {
        let mindistance = 30000, sub;
        for(let i = 0; i < this.length - 1; i++) {
            const temp = schematic.nodeToSegment(node,[this[i], this[i + 1]]);
            if(temp < mindistance) {
                mindistance = temp;
                sub = i;
            }
        }
        if(mindistance < 11) {
            return(sub);
        } else {
            return(false);
        }
    }
    */
};
Object.setPrototypeOf(LineWay.prototype, Array.prototype);
LineWay.prototype[Symbol.isConcatSpreadable] = true;

//[点->路径]的键值对类，整个设计与Map数据结构类似
//只接受Point实例作为键，以及LineWay实例的键值
function WayMap(pair) {
    if(pair instanceof Array) {
        this.size = pair.length;
        for (let i = 0; i < pair.length; i++) {
            const [key,value] = pair[i][0];
            this.set(key, value);
        }
    } else {
        this.size = 0;
    }
    //size不可枚举
    Object.defineProperty(this, "size", {
        enumerable: false,
        configurable: false
    });
}
WayMap.extend({
    checkKeyError(key) {
        if (!Point.isPoint(key) ||
            !key.isEqual(Point.prototype.floor.call(key))) {
            throw ("键的格式错误");
        }
    },
    //检查键值的格式
    checkValueError(value) {
        if (!(value instanceof LineWay)) {
            throw ("键值必须是LineWay的实例");
        }
    },
    //将键转换为内部hash的键
    keyToHash(key) {
        return(key[0] * 5 + key[1] * 0.05);
    },
    //内部hash值转换为键
    hashToKey(hash) {
        const ans = [], temp = hash % 100;
        ans[1] = temp * 20;
        ans[0] = (hash - temp) * 0.2;
        return(Point(ans));
    }
});
WayMap.prototype = {
    constructor: WayMap,
    //返回键key关联的值,如果该键不存在则返回undefined
    get(key) {
        WayMap.checkKeyError(key);
        return(this[WayMap.keyToHash(key)]);
    },
    //设置键key在myMap中的值为value
    //mode表示设定模式，默认为default，表示强制覆写；输入small，表示之前就有的和当前输入的保留节点数量少的
    set(key, value, mode = "default") {
        WayMap.checkKeyError(key);
        WayMap.checkValueError(value);
        const tempHash = WayMap.keyToHash(key);
        if (this[tempHash]) {
            if (mode === "default") {
                this[tempHash] = value;
            } else if (mode === "small") {
                if (this[tempHash].length > value.length)
                    this[tempHash] = value;
            }
        } else {
            this[tempHash] = value;
            this.size += 1;
        }
    },
    //返回一个布尔值,表明键key是否存在于Map中
    has(key) {
        return(!!this.get(key));
    },
    //返回所有key
    keys() {
        const keys = [];
        for(let i in this) {
            if(this.hasOwnProperty(i)) {
                keys.push(WayMap.hashToKey(i));
            }
        }
        return(keys);
    },
    //forEach遍历函数，功能类似Array的forEach函数，key、value为键和键值
    forEach(callback) {
        for(let i in this) {
            if(this.hasOwnProperty(i)) {
                callback(WayMap.hashToKey(i), this[i], this);
            }
        }
    },
    //返回节点最多的路径
    nodeMax() {
        let max = -Infinity, ans;
        this.forEach(function(key, way) {
            if(way.length > max) {
                max = way.length;
                ans = way;
            }
        });
        return(ans);
    },
    //如果有相同的key，那么将this的值赋值给新的map
    forSameNode(points, map) {
        this.forEach((node, way) => {
            for(let i = 0; i < points.length; i++) {
                if(node.isEqual(points[i])) {
                    map.set(node, way);
                }
            }
        });
    }
};

//导线类
function LineClass(part, mark) {
    let start;      //起点声明

    this.way = new LineWay();       //导线路径
    this.circle = [false,false];    //导线端点DOM
    this.connect = ["",""];         //导线连接点
    this.partType = "line";         //导线类型
    this.id = partsAll.newId(this.partType + "_");

    //导线属性
    const line = {
        tag: "<g>",
        attribute: {
            "class": "line",
            "id": this.id,
            "transform": "translate(0,0)"
        },
        child: [
            {
                tag: "<path>",
            }
        ]
    };
    //导线的端点属性
    const circle = {
        tag: "<g>",
        attribute: {
            "class": "line-point draw-open",
            "transform": "translate(0,0)"
        },
        child: [
            {
                tag: "<circle>"
            },{
                tag: "<rect>",
                attribute: {
                    "class": "rect-line-point"
                }
            }
        ]
    };

    if(!!part.elementDOM && mark !== undefined) {
        //输入是器件和器件管脚
        const pointInfor = part.pointRotate(),
            trend = Point(pointInfor[mark].direction);
        start = Point([
            part.position[0] + pointInfor[mark].position[0],
            part.position[1] + pointInfor[mark].position[1]
        ]);

        //导线与器件管脚相互连接
        this.setConnect(0, part.id + "-" + mark);
        part.setConnect(mark, this.id);
        //当前导线的临时变量
        this.current = {
            startNode: start,
            initTrend: trend,
            mouseGrid: new WayMap(),
            enforceAlign: {     //直接对齐模式
                flag:false,     //是否强制更新路径
                onPart:false,   //鼠标是否在某器件上面
                part:false,     //直接对齐的器件
                label:false     //直接对齐的坐标
            }
        };
        this.way.push(Point(start));
    } else if(typeof part === "object") {
        //输入是对象
        this.extend(part);
        this.current = {};
        this.way = new LineWay(this.way);
    }

    //创建导线DOM
    this.elementDOM = creatDOM(line);
    for(let i = 0; i < 2; i++) {
        this.circle[i] = creatDOM(circle);
        this.circle[i].attr("id", this.id + "-" + i);
        this.circle[i].attr("transform", "translate(" + this.way.get(-1 * i).join(",") + ")");
        this.elementDOM.append(this.circle[i]);
        this.setConnect(i);
    }

    this.toGoing();
    this.wayDrawing();
    //冻结导线的常规属性，current是临时变量可以随意变动
    Object.defineProperties(this, {
        "way": {
            configurable: false,
            writable: false
        },
        "position": {
            configurable: false,
            writable: false
        },
        "circle": {
            configurable: false,
            writable: false
        },
        "connect": {
            configurable: false,
            writable: false
        },
        "partType": {
            configurable: false,
            writable: false
        }
    });
    Object.seal(this);
    partsAll.push(this);
}
LineClass.prototype = {
    constructor: LineClass,
    //导线转换为持续状态，即path删除剩下一个，rect全部删除
    toGoing() {
        const linepath = $("path", this.elementDOM);
        while (linepath.length > 1) {
            linepath.pop().remove();
        }
        $("rect.line-rect", this.elementDOM).remove();
        //导线放置在最底层
        actionArea.preappend(this.elementDOM);
    },
    //返回连接点所连接器件类型
    getConnectStatus(Num) {
        const tempConnect = this.connect[Num];
        if (tempConnect.search(" ") !== -1) {
            return ("line");
        } else if (tempConnect.search("-") !== -1) {
            return ("part");
        } else {
            return (false);
        }
    },
    //移动导线端点
    moveCircle(Num,position) {
        this.circle[Num].attr("transform", "translate(" + position.join(",") + ")");
    },
    //绘制导线
    wayDrawing() {
        if(this.way.length < 1) {
            throw("路径数据错误");
        }
        let temp = "M" + this.way[0][0] + "," + this.way[0][1];
        for(let i = 1; i < this.way.length; i++) {
            temp += "L" + this.way[i][0] + "," + this.way[i][1];
        }

        $("path", this.elementDOM).attr("d", temp);
        this.moveCircle(0, this.way[0]);
        this.moveCircle(1, this.way.get(-1));
    },
    //导线图形渲染
    render() {
        let templine = this.elementDOM,
            linepath = $("path", templine),
            linerect = $("rect.line-rect", templine),
            tempway = this.way;

        tempway.checkWayRepeat();
        tempway.standardize();

        //多余的导线线段需要删除
        while (linepath.length > this.way.length - 1) {
            linepath.remove(-1);
        }
        while (linerect.length > this.way.length - 1) {
            linerect.remove(-1);
        }
        //绘制导线图像，path部分需要放置底层
        for (let i = 0; i < tempway.length - 1; i++){
            if(!linepath[i]) {
                templine.append($("<path>", SVG_NS, {
                    "d": "M" + tempway[i][0] + "," + tempway[i][1] +
                    "L" + tempway[i + 1][0] + "," + tempway[i + 1][1]
                }));
            } else {
                linepath.get(i).attr("d",
                    "M" + tempway[i][0] + "," + tempway[i][1] + "L" +
                    tempway[i + 1][0] + "," + tempway[i + 1][1]);
            }
        }
        for (let i = 0; i < tempway.length - 1; i++){
            if(!linerect[i]) {
                templine.append($("<rect>", SVG_NS, lineRectAttr(tempway[i], tempway[i + 1])));
            } else {
                linerect.get(i).attr(lineRectAttr(tempway[i], tempway[i + 1]));
            }
        }
        this.elementDOM.attr("transform", "translate(0,0)");
        this.resetCircle(0);
        this.resetCircle(1);
    },
    //从连接表中删除某一个导线
    deleteConnect(lineId) {
        this.connect.forEach(function(item,index,arr) {
            if(item.search(lineId) !== -1) {
                arr[index] = item.split(" ").filter((n) => n !== lineId).join(" ");
            }
        });
    },
    //从连接表中连接的器件中把oldID替换成newID
    replaceConnect(sub,newId) {
        let connectId = this.connect[sub];
        if (connectId.search("-") !== -1) {              //此连接点连接到了器件
            let tempcon = connectId.split("-");
            let partObj = partsAll.findPart(tempcon[0]);
            let pointMark = parseInt(tempcon[1]);
            partObj.setConnect(pointMark, newId);      //替换器件的引脚连接
        } else {
            let lines = connectId.split(" ").map(function (item) {    //查询所有连接的导线
                return (partsAll.findPart(item));
            });
            for (let i = 0; i < lines.length; i++) {
                lines[i].connect[0] = lines[i].connect[0].replace(this.id, newId);
                lines[i].connect[1] = lines[i].connect[1].replace(this.id, newId);
            }
            let crossNode = this.way[sub * (this.way.length - 1)];
            let crossStatus = schMap.getValueByOrigin(crossNode);
            crossStatus.id = crossStatus.id.replace(this.id, newId);
        }
    },
    //导线翻转
    reverse() {
        this.way.reverse();
        this.connect.reverse();
        this.circle.reverse();
    },
    //设置导线端点
    setConnect(mark, id) {
        if(arguments.length === 2) {
            //没有输入连接导线的时候，连接表不变
            this.connect[mark] = id;
        }

        if (this.connect[mark]) {
            if (this.connect[mark].search(" ") === -1) {
                //没有搜索到空格，表示连接到器件
                this.circle[mark].attr("class", "line-point draw-close");
            } else {
                //连接到交错节点
                this.circle[mark].attr("class", "line-point cross-point");
            }
        }
    },
    //缩小节点
    shrinkPoint(Num) {
        $("circle", this.circle[Num]).attr("style", "r:4");
    },
    //放大节点
    enlargePoint(Num) {
        $("circle", this.circle[Num]).attr("style", "r:8");
    },
    //端点复原
    resetCircle(num) {
        this.elementDOM.append(this.circle[num]);
        this.moveCircle(num, this.way[num * (this.way.length - 1)]);
        $("circle", this.circle[num]).attr("style", "");
    },
    //转换节点为绘制状态
    drawCircle(Num) {
        this.connect[1] = "";
        this.circle[Num].attr("class", "line-point draw-open");
        $("circle", this.circle[Num]).attr("style", "r:8");
    },
    //器件高亮
    toFocus() {
        this.elementDOM.addClass("focus");
        partsNow.push(this);
    },
    //器件取消高亮
    toNormal() {
        this.elementDOM.removeClass("focus");
        this.current = {};
    },
    //position是导线的起点还是终点，起点为0，终点为1，假如两个都不是返回-1
    findConnect(position) {
        if(position[0] === this.way[0][0] && position[1] === this.way[0][1]){
            return(0);
        } else if(position[0] === this.way[this.way.length - 1][0] && position[1] === this.way[this.way.length - 1][1]){
            return(1);
        } else return(-1);
    },
    //拆分导线，splited为被拆分导线，this为分割导线的导线，sub表示交错节点是this路径的起点/终点
    splitLine(splited, sub) {
        const NodeCross = Array.clone(this.way[sub * (this.way.length - 1)]),
            devices = new LineClass(NodeCross);

        //导线连接表
        splited.replaceConnect(1,devices.id);              //替换连接器件的ID
        devices.setConnect(1,splited.connect[1]);          //原导线起点不变，新导线的终点等于原导线的终点
        devices.setConnect(0,splited.id + " " + this.id);  //新导线起点由旧导线ID和分割旧导线的导线ID组成
        this.setConnect(1,splited.id + " " + devices.id);  //分割旧导线的导线终点由新旧导线ID组成
        splited.setConnect(1,devices.id + " " + this.id);  //旧导线终点由新导线ID和分割旧导线的导线ID组成

        //拆分路径
        let crossSub = 0;
        for (let i = 0; i < splited.way.length-1; i++) { //寻找交错点所在线段
            if((NodeCross[0] === splited.way[i][0]) && (NodeCross[0] === splited.way[i+1][0])) {
                if(((NodeCross[1] <= splited.way[i][1]) && (NodeCross[1] >= splited.way[i+1][1])) ||
                    ((NodeCross[1] >= splited.way[i][1]) && (NodeCross[1] <= splited.way[i+1][1])))
                { crossSub = i; break; }
            }else if ((NodeCross[1] === splited.way[i][1]) && (NodeCross[1] === splited.way[i+1][1])) {
                if(((NodeCross[0] <= splited.way[i][0]) && (NodeCross[0] >= splited.way[i+1][0])) ||
                    ((NodeCross[0] >= splited.way[i][0]) && (NodeCross[0] <= splited.way[i+1][0])))
                { crossSub = i; break; }
            }
        }
        devices.way.clone(splited.way.slice(crossSub + 1));
        devices.way.unshift(NodeCross);
        splited.way.splice(crossSub + 1,splited.way.length - crossSub - 1);
        splited.way.push(NodeCross);

        //将新建的导线加入图纸中
        this.elementDOM.preappendTo(actionArea);
        splited.render();
        splited.markSign();
        splited.toFocus();
        devices.render();
        devices.markSign();
        devices.toFocus();

        //改变图纸标记
        schMap.setValueByOrigin(NodeCross, {
            form : "cross-point",
            id : this.id + " " + splited.id + " " + devices.id
        });
        devices.markSign();
    },
    //删除导线
    deleteSelf() {
        for(let i = 0; i < this.connect.length; i++) {
            if (this.getConnectStatus(i) === "line") {
                const lines = this.connect[i].split(" ").map((n) => partsAll.findPart(n));

                lines.forEach((n) => n && n.deleteConnect(this.id));

                if (lines.length === 2) {
                    lines[0] && lines[0].mergeLine(lines[1]);
                }
            } else if (this.getConnectStatus(i) === "part") {
                const temp = this.connect[i].split("-"),
                    part = partsAll.findPart(temp[0]);

                //有可能该器件已经被删除
                if (part) {
                    part.setConnect(temp[1], false);
                }
            }
        }
        this.deleteSign();
        this.elementDOM.remove();
        partsAll.deletePart(this);
    },
    //合并导线，保留this，删除Fragment
    mergeLine(Fragment) {
        if (!Fragment || Fragment.partType !== "line") {
            return (false);
        }
        if (this.way[0].isEqual(Fragment.way[0])) {
            this.reverse();
        } else if (this.way[0].isEqual(Fragment.way.get(-1))) {
            this.reverse();
            Fragment.reverse();
        } else if (this.way.get(-1).isEqual(Fragment.way.get(-1))) {
            Fragment.reverse();
        }
        schMap.setValueByOrigin(this.way.get(-1), {
            form: "line"
        });
        this.way.clone(this.way.concat(Fragment.way));
        this.way.checkWayRepeat();
        this.setConnect(1, Fragment.connect[1]);
        Fragment.replaceConnect(1, this.id);        //改变被删除导线终点连接器件的连接关系
        Fragment.elementDOM.remove();               //移除图中的DOM
        this.render();
        this.markSign();
        partsAll.deletePart(Fragment);
    },
    //导线是否被占用
    isCover(bias) {
        const way = bias
                ? this.way.map((n) => n.add(bias).round())
                : this.way.map((n) => n.round()),
            nodes = way.nodeCollection();

        for(let i = 0; i < nodes.length; i++) {
            const node = nodes[i],
                status = schMap.getValueByOrigin(node);

            if (node.isEqual(way[0]) || node.isEqual(way.get(-1))) {
                //端点处可以等于其自身的cross-point
                if (status && status.form === "cross-point") {
                    if (!status.id.indexOf(this.id)) {
                        return (true);
                    }
                } else if (status) {
                    return (true);
                }
            } else if (status) {
                //非端点处什么都不能有
                return (true);
            }
        }
        return (false);
    },
    //在图中标记导线
    markSign() {
        const nodes = this.way.nodeCollection();

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i],
                last = nodes[i - 1];
            if (i && i !== nodes.length - 1) {
                //非端点节点
                schMap.setValueByOrigin(node, {
                    form: "line",
                    id: this.id,
                    connect: []
                });
            } else {
                //导线起点、终点
                const status = schMap.getValueByOrigin(node);
                if (!status) {
                    schMap.setValueByOrigin(node, {
                        form: "line-point",
                        id: this.id,
                        connect: []
                    });
                }
                else if (status.form === "cross-point" &&
                    status.id.search(this.id) === -1) {
                    if (!status.id) {
                        //当前ID为空，那么直接赋值
                        status.id = this.id;
                    } else {
                        //当前ID不为空，那么向原ID后面追加当前ID
                        status.id += " " + this.id;
                    }
                }
                else if(status.form === "line-point") {
                    const id = status.id;
                    schMap.setValueByOrigin(node, {
                        form: "cross-point",
                        id: this.id + " " + id
                    });
                }
            }
            if (last) {
                schMap.pushConnectByOrigin(node, last);
                schMap.pushConnectByOrigin(last, node);
            }
        }
    },
    //删除导线标记
    deleteSign() {
        const nodes = this.way.nodeCollection();
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (i && i !== nodes.length - 1) {
                //非端点节点
                schMap.deleteValueByOrigin(node);
            } else {
                //导线端点
                const status = schMap.getValueByOrigin(node);
                if (!status) { continue; }

                if (status.form === "line-point") {
                    schMap.deleteValueByOrigin(node);
                }
                else if (status.form === "cross-point") {
                    status.id = status.id.split(" ")
                        .filter((n) => n !== this.id)
                        .join(" ");

                    //当前交错节点为空，那么删除此点
                    if(!status.id) {
                        schMap.deleteValueByOrigin(node);
                    }
                }
            }
        }
    },
    //将导线起点/终点所连接导线重置
    resetPoint(Num) {
        const lines = this.connect[Num].split(" "),
            crossPointOld = this.current.wayBackup.get(-1 * Num),
            crossPointNew = this.way.get(-1 * Num);

        //连接处不是导线，不需要重置连接关系
        if (this.getConnectStatus(Num) !== "line") {
            return (true);
        }
        //新旧交错节点相等，不需要重置连接关系
        if (crossPointOld.isEqual(crossPointNew)) {
            return (true);
        }

        if (lines.length === 2) {
            //只连接了两个器件，那么连接表不变，改变导线端点即可
            schMap.setValueByOrigin(crossPointOld, {
                form: "line",
                id: this.id
            });
            schMap.setValueByOrigin(crossPointNew, {
                form: "cross-point",
                id: this.id
            });
            lines.forEach(function (n) {
                const line = partsAll.findPart(n),
                    sub = crossPointOld.isEqual(line.way[0])
                        ? 0 : line.way.length;

                line.way.splice(sub, 0, Point(crossPointNew));
                line.way.checkWayRepeat();
                line.render();
                line.markSign();
            });
        } else if (lines.length === 3) {
            //连接了三个器件，那么三个器件从连接表中删除当前导线
            //导线在新交错节点中将那个导线拆分
            lines.forEach((item) => {
                partsAll.findPart(item)
                    .deleteConnect(this.id);
            });
            const crossValue = schMap.getValueByOrigin(crossPointOld).id,
                splited = partsAll.findPart(schMap.getValueByOrigin(crossPointNew).id);
            schMap.setValueByOrigin(crossPointOld, {
                id: crossValue.split(" ")
                    .map((n) => n !== this.id)
                    .join(" ")
            })
            this.splitLine(splited, Num);
        }
    },
    /*
    //将导线起点、终点的交错节点的DOM集合到current中
    collectCircle(Num) {
        if (this.getConnectStatus(Num) !== "line") return ([]);
        const temp = this.connect[Num].split(" ");
        if (temp.length === 3) {
            return ([this.circle[Num]]);
        } else if (temp.length === 2) {
            //交错节点坐标
            const crossPoint = Array.clone(this.way[Num * (this.way.length - 1)]);
            return (
                temp.map((n) => partsAll.findPart(n)).map((item) => item.circle[item.findConnect(crossPoint)])
            );
        }
        return (false);
    },
    //鼠标变形结束
    deformSelfEnd() {
        this.way.standardize();
        this.setCollectCircle(0);
        this.setCollectCircle(1);
        this.render();
        this.markSign();
    },
    */
    //按照标准格式输出
    toSimpleData() {
        return ({
            partType: "line",
            way: new LineWay(this.way),
            connect: Array.clone(this.connect)
        });
    },
    //导线旋转
    rotateSelf(matrix, center) {
        for(let i = 0; i < this.way.length; i++) {
            this.way[i] = this.way[i].rotate(matrix, center);
        }
        this.wayDrawing();
        return(this);
    },
    //计算导线初始方向
    initTrend(sub) {
        const point = this.way[sub * (this.way.length - 1)],
            tempstatus = schMap.getValueByOrigin(point);

        if(tempstatus && tempstatus.form === "part-point") {
            //导线出线方向为起点器件的引脚方向
            const tempArr = tempstatus.id.split("-"),
                mark = tempArr[1],
                part = partsAll.findPart(tempArr[0]),
                pointInfor = part.pointRotate()[mark];

            return(Point(pointInfor.direction));
        } else {
            //非器件，则初始方向为当前路径的第一或者最后的线段的方向
            if (sub) {
                return((Point([this.way.get(-1), this.way.get(-2)])).toUnit());
            } else {
                return((Point(this.way.slice(0,2))).toUnit());
            }
        }
    },
    //由连接关系求端点坐标
    connectNode(sub) {
        const con = this.connect[sub];
        if(!con) { return(false); }

        if(con.indexOf(" ") !== -1) {
            //导线
            const lines = con.split(" ").map((n) => partsAll.findPart(n).way);
            //导线节点交集
            let point = lines[0];
            for(let i = 1; i < lines.length; i++) {
                point = point.filter((v) => lines[i].some((p) => p.isEqual(v)));
            }
            return(Point(point[0]));
        } else {
            //器件
            const tempArr = con.split("-"),
                mark = tempArr[1],
                part = partsAll.findPart(tempArr[0]),
                pointInfor = part.pointRotate()[mark];

            return(part.position.add(pointInfor.position));
        }
    },
    //整体移动
    move(bais) {
        const position = (this.current.bias || Point([0,0])).add(bais);

        this.elementDOM.attr("transform",
            "translate(" + position.join(",") + ")");
    },
    //导线路径开始
    startPath(event, opt, ...args) {
        Search[opt].start.call(this, event, ...args);
    },
    //生成导线路径
    setPath(event, opt) {
        Search[opt].callback.call(this, event);
    },
    //导线变化结束
    putDown(event, opt) {
        Search[opt].end.call(this, event);
    }
};

export { LineClass };