// 图纸数据
const map = window.$map = {};

// 图纸对外暴露的方法
const schMap = {
    // 取得节点属性
    getValueBySmalle(x, y) {
        if (x.length) { [x, y] = x; }

        if (!map[x] || !map[x][y]) {
            return (false);
        }
        return (map[x][y]);
    },
    getValueByOrigin(x, y) {
        if (x.length) { [x, y] = x; }

        return (schMap.getValueBySmalle(x / 20, y / 20));
    },
    // 设定节点属性，默认为覆盖模式
    setValueBySmalle(node, attribute, cover = false) {
        const [x, y] = node;

        if (!map[x]) {
            map[x] = [];
        }
        if (cover) {
            // 删除原来的属性
            map[x][y] = {};
        } else if (!map[x][y]) {
            // 覆盖模式下只有当节点为空的之后才会重新创建
            map[x][y] = {};
        }

        Object.assign(map[x][y], attribute);
    },
    setValueByOrigin(node, attribute, cover = false) {
        schMap.setValueBySmalle([node[0] / 20, node[1] / 20], attribute, cover);
    },
    // 删除节点
    deleteValueBySmalle(x, y) {
        if (x.length) { [x, y] = x; }

        const status = schMap.getValueBySmalle(x, y);
        if (status && status.connect) {
            // 删除与当前点相连的点的连接信息
            for (let i = 0; i < status.connect.length; i++) {
                schMap.deleteConnectBySmalle(status.connect[i], x);
            }
        }
        if (status) {
            delete map[x][y];
        }
        if (Object.isEmpty(map[x])) {
            delete map[x];
        }
    },
    deleteValueByOrigin(x, y) {
        if (x.length) { [x, y] = x; }

        return (schMap.deleteValueBySmalle(x / 20, y / 20));
    },
    // 添加连接关系，如果重复那么就忽略
    pushConnectBySmalle(node, connect) {
        let status = schMap.getValueBySmalle(node);

        if (!status) {
            return (false);
        }
        if (!status.connect) {
            status.connect = [];
        }
        status = status.connect;
        for (let i = 0; i < status.length; i++) {
            if (status[i].isEqual(connect)) {
                return (false);
            }
        }
        status.push(connect);
        return (true);
    },
    pushConnectByOrigin(node, connect) {
        node = [node[0] / 20, node[1] / 20];
        connect = [connect[0] / 20, connect[1] / 20];

        return schMap.pushConnectBySmalle(node, connect);
    },
    // 删除连接关系，如果没有那么忽略
    deleteConnectBySmalle(node, connect) {
        const status = schMap.getValueBySmalle(node);

        if (!status || !status.connect) {
            return (false);
        }

        for (let i = 0; i < status.connect.length; i++) {
            if (status.connect[i].isEqual(connect)) {
                status.connect.splice(i, 1);
                break;
            }
        }
        return (true);
    },
    // node 和 connect 是否相连
    isNodeInConnectBySmall(node, connect) {
        const status = schMap.getValueBySmalle(node);

        return (
            status &&
            /(line|point)/.test(status.type) &&
            status.connect.some((point) => point.isEqual(connect))
        );
    },
    isNodeInConnectByOrigin(a, b) {
        const node = [a[0] / 20, a[1] / 20],
            connect = [b[0] / 20, b[1] / 20];

        return schMap.nodeInConnectBySmall(node, connect);
    },
    deleteConnectByOrigin(node, connect) {
        node = [node[0] / 20, node[1] / 20];
        connect = [connect[0] / 20, connect[1] / 20];

        return schMap.deleteConnectBySmalle(node, connect);
    },
    isLineBySmall(x, y) {
        if (x.length) { [x, y] = x; }

        const status = schMap.getValueBySmalle(x, y);

        return (
            status &&
            status.type === 'line' ||
            status.type === 'cross-point' ||
            status.type === 'cover-point'
        );
    },
    isLineByOrigin(x, y) {
        if (x.length) { [x, y] = x; }

        return schMap.isLineBySmall([x[0] * 0.05, y[1] * 0.05]);
    },
    // 在 [start、end] 范围中沿着 vector 直行，求最后一点的坐标
    alongTheLineBySmall(
        start,
        end = [Infinity, Infinity],
        vector = [end[0] - start[0], end[1] - start[1]]
    ) {
        // 单位向量
        vector = vector.map((n) => Math.sign(n));

        // 起点并不是导线或者起点等于终点，直接返回
        if (!schMap.isLineBySmall(start) || start.isEqual(end)) {
            return (start);
        }

        let node = [start[0], start[1]],
            next = [node[0] + vector[0], node[1] + vector[1]];
        // 当前点没有到达终点，还在导线所在直线内部，那就前进
        while (schMap.isLineBySmall(next) && !node.isEqual(end)) {
            if (schMap.nodeInConnectBySmall(node, next)) {
                node = next;
                next = [node[0] + vector[0], node[1] + vector[1]];
            } else {
                break;
            }
        }

        return node;
    },
    alongTheLineByOrigin(a, b, c) {
        const start = [a[0] / 20, a[1] / 20],
            end = [b[0] / 20, b[1] / 20],
            ans = schMap.alongTheLineBySmall(start, end, c);

        return ([ans[0] * 20, ans[1] * 20]);
    },
};

export { schMap };
